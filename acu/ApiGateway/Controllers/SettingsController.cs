using System.Text.RegularExpressions;
using Acu.Storage.Models;
using Acu.Storage.Store;
using Microsoft.AspNetCore.Mvc;

namespace AcuApiGateway.Controllers;

/// <summary>ACU-wide settings that the operator manages and every robot receives.</summary>
[ApiController]
[Route("api")]
[Tags("Settings")]
[Produces("application/json")]
public partial class SettingsController(AcuSettingsStore store) : ControllerBase
{
    [GeneratedRegex("^[a-z]{2,3}-[A-Z]{2}$")]
    private static partial Regex LanguageTag();

    /// <summary>Returns the ACU settings.</summary>
    /// <response code="200">Current settings (defaults when never saved).</response>
    [HttpGet("acu/settings")]
    [ProducesResponseType(typeof(AcuSettings), StatusCodes.Status200OK)]
    public IActionResult GetSettings() => Ok(store.Get());

    /// <summary>Replaces the ACU settings.</summary>
    /// <remarks>
    /// <c>speechLanguage</c> is a BCP-47 tag such as <c>de-DE</c>, <c>en-US</c> or <c>hi-IN</c>.
    /// Robots receive it in every heartbeat response and speak step TTS text in that language.
    /// </remarks>
    /// <response code="200">Settings saved.</response>
    /// <response code="400">Invalid language tag.</response>
    [HttpPut("acu/settings")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(AcuSettings), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(object), StatusCodes.Status400BadRequest)]
    public IActionResult PutSettings([FromBody] AcuSettings body)
    {
        var language = body.SpeechLanguage?.Trim() ?? "";
        if (!LanguageTag().IsMatch(language))
            return BadRequest(new { error = "'speechLanguage' must be a language tag such as de-DE, en-US or hi-IN." });
        var settings = new AcuSettings { SpeechLanguage = language };
        store.Save(settings);
        return Ok(settings);
    }
}
