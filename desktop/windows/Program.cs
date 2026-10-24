using System.Windows.Forms;

namespace DukaanOS.Windows;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new ShopWindow());
    }
}
