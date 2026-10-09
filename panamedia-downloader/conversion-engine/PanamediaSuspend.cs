using System;
using System.Runtime.InteropServices;

public class Program {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("ntdll.dll")]
    public static extern int NtSuspendProcess(IntPtr processHandle);

    [DllImport("ntdll.dll")]
    public static extern int NtResumeProcess(IntPtr processHandle);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr handle);

    public static int Main(string[] args) {
        if (args == null || args.Length < 2) return 1;
        int pid;
        if (!int.TryParse(args[0], out pid) || pid <= 0) return 2;
        string action = (args[1] ?? "").Trim().ToLowerInvariant();
        IntPtr handle = OpenProcess(0x0800, false, pid); // PROCESS_SUSPEND_RESUME = 0x0800
        if (handle == IntPtr.Zero) return 3;
        try {
            int status = action == "pause" ? NtSuspendProcess(handle) : NtResumeProcess(handle);
            return status == 0 ? 0 : 4;
        } catch {
            return 5;
        } finally {
            CloseHandle(handle);
        }
    }
}
