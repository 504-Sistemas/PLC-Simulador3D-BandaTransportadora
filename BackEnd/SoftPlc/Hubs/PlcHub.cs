using Microsoft.AspNetCore.SignalR;
using SoftPlc.Services;

namespace SoftPlc.Hubs;

public class PlcHub : Hub
{
    private readonly ConveyorPlcService _plcService;

    public PlcHub(ConveyorPlcService plcService)
    {
        _plcService = plcService;
    }

    // Cuando React se conecta, le enviamos inmediatamente el estado actual del PLC
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("ReceivePlcState", _plcService.GetStateSnapshot());
        await base.OnConnectedAsync();
    }

    // Método que React invoca cuando el usuario presiona un sensor o botón (I1..I6)
    public Task SendSensorSignal(string inputCode, bool value)
    {
        _plcService.SetInput(inputCode, value);
        return Task.CompletedTask;
    }

    // Método para poner en cero los contadores de piezas
    public Task ResetCounters()
    {
        _plcService.ResetCounters();
        return Task.CompletedTask;
    }
}