using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using AcuApiGateway.WebSockets;
using Acu.Storage.Store;

var builder = WebApplication.CreateBuilder(args);

// ── JSON: camelCase output, null-values omitted, case-insensitive binding ──
builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        opts.JsonSerializerOptions.PropertyNamingPolicy        = JsonNamingPolicy.CamelCase;
        opts.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        opts.JsonSerializerOptions.DefaultIgnoreCondition      = JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services.AddEndpointsApiExplorer();

// ── CORS ───────────────────────────────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new()
    {
        Title       = "ACU API Gateway",
        Version     = "v1",
        Description = "ACU Container REST API – C# edition"
    });

    // Include XML <summary> comments in Swagger UI
    var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (File.Exists(xmlPath))
        c.IncludeXmlComments(xmlPath);
});

// ── Singleton store (backed by /data/devices.json) ─────────────────────────
builder.Services.AddSingleton<DeviceStore>();

// ── Singleton store (backed by /data/workflows.json) ───────────────────────
builder.Services.AddSingleton<WorkflowStore>();

// ── Singleton store (backed by RobotWorkflowDataPath) ──────────────────
builder.Services.AddSingleton<RobotWorkflowStore>();
builder.Services.AddSingleton<AcuApiGateway.Services.RobotWorkflowService>();
builder.Services.AddSingleton<AcuApiGateway.Services.RobotMediaService>();
builder.Services.AddSingleton<AcuApiGateway.Services.CameraFrameStore>();
builder.Services.AddSingleton<AcuApiGateway.Services.SensorStore>();

// ── Singleton store (backed by AcuSettingsDataPath) ────────────────────────
builder.Services.AddSingleton<AcuSettingsStore>();

// ── WebSocket services ─────────────────────────────────────────────────────
builder.Services.AddSingleton<BotConnectionManager>();
builder.Services.AddSingleton<BotWebSocketHandler>();

var app = builder.Build();

// ── WebSockets (must come before routing/controllers) ─────────────────────
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(30)
});

// ── WebSocket test console: http://localhost:3000/ws-test ─────────────────
app.MapGet("/ws-test", async (HttpContext ctx) =>
{
    ctx.Response.ContentType = "text/html; charset=utf-8";
    await ctx.Response.WriteAsync(AcuApiGateway.WebSockets.WsTestPage.Html);
});

// ── WebSocket endpoint: ws://host:3000/ws/bot/{deviceId} ──────────────────
app.MapGet("/ws/bot/{deviceId}", async (string deviceId, HttpContext ctx, BotWebSocketHandler handler) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest)
    {
        ctx.Response.StatusCode = StatusCodes.Status426UpgradeRequired;
        await ctx.Response.WriteAsync("This endpoint requires a WebSocket connection.");
        return;
    }

    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    await handler.HandleAsync(deviceId, ws, ctx.RequestAborted);
});

app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "ACU API Gateway v1");
    c.RoutePrefix = "docs";
});

app.UseCors();        
app.MapControllers();

// ── Background: mark devices offline when heartbeat > 20 s old ─────────────
var store = app.Services.GetRequiredService<DeviceStore>();
using var cts = new CancellationTokenSource();
_ = Task.Run(async () =>
{
    while (!cts.Token.IsCancellationRequested)
    {
        try
        {
            await Task.Delay(10_000, cts.Token);
            store.UpdateOnlineStatus();
        }
        catch (OperationCanceledException) { break; }
    }
}, cts.Token);

app.Lifetime.ApplicationStopping.Register(() => cts.Cancel());

app.Run("http://+:3000");

// Exposes the implicit Program class so component tests can boot the real
// application in-memory via WebApplicationFactory<Program>.
public partial class Program { }
