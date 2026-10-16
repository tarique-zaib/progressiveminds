using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using ProgressiveMinds.Api.Contracts;
using ProgressiveMinds.Api.Models;
using ProgressiveMinds.Api.Services;
using System.Security.Claims;

namespace ProgressiveMinds.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly UserManager<AppUser> _userManager;
    private readonly SignInManager<AppUser> _signInManager;
    private readonly JwtTokenService _tokenService;

    public AuthController(
        UserManager<AppUser> userManager,
        SignInManager<AppUser> signInManager,
        JwtTokenService tokenService)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _tokenService = tokenService;
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password))
            return BadRequest(new { message = "Email and password are required." });

        var user = await _userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null)
            return Unauthorized(new { message = "Invalid email or password." });

        var signInResult = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (signInResult.IsLockedOut)
            return StatusCode(StatusCodes.Status423Locked, new { message = "Account is temporarily locked. Try again later." });

        if (!signInResult.Succeeded)
            return Unauthorized(new { message = "Invalid email or password." });

        var (token, expiresAtUtc) = await _tokenService.CreateAsync(user);
        var roles = (await _userManager.GetRolesAsync(user)).ToArray();

        return Ok(new LoginResponse(
            token,
            expiresAtUtc,
            new UserDto(user.Id.ToString(), user.Email ?? string.Empty, user.FirstName, user.LastName, roles)));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userId, out var id))
            return Unauthorized();

        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
            return Unauthorized();

        var roles = (await _userManager.GetRolesAsync(user)).ToArray();
        return Ok(new UserDto(user.Id.ToString(), user.Email ?? string.Empty, user.FirstName, user.LastName, roles));
    }
}
