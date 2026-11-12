using SoftPlc.Hubs;
using SoftPlc.Services;

var builder = WebApplication.CreateBuilder(args);

// 1. Habilitar SignalR
builder.Services.AddSignalR();

// 2. Registrar nuestro SoftPLC como Singleton y servicio en segundo plano (Scan Cycle)
builder.Services.AddSingleton<ConveyorPlcService>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<ConveyorPlcService>());

// 3. Configurar CORS para permitir la conexión desde React (puerto 5173)
builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactHmiPolicy", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("ReactHmiPolicy");
app.UseAuthorization();
app.MapControllers();

// 4. Exponer el Hub de SignalR en /plchub
app.MapHub<PlcHub>("/plchub");

// 5. Escuchar en el puerto 5000
app.Run("http://localhost:5000");