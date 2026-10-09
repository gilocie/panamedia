const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const source = `
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
        if (args.Length < 2) return 1;
        int pid;
        if (!int.TryParse(args[0], out pid) || pid <= 0) return 2;
        string action = args[1].ToLowerInvariant();
        IntPtr handle = OpenProcess(0x0800, false, pid);
        if (handle == IntPtr.Zero) return 3;
        try {
            int status = action == "pause" ? NtSuspendProcess(handle) : NtResumeProcess(handle);
            return status == 0 ? 0 : 4;
        } finally {
            CloseHandle(handle);
        }
    }
}
`;

const csPath = path.join(__dirname, '..', 'panamedia-downloader', 'conversion-engine', 'PanamediaSuspend.cs');
fs.writeFileSync(csPath, source.trim(), 'utf8');

const cscExe = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const outDirs = [
  path.join(__dirname, '..', 'bin'),
  path.join(__dirname, '..', 'src-cpp', 'build', 'bin', 'Release')
];

for (const dir of outDirs) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const outExe = path.join(dir, 'panamedia-suspend.exe');
  execFileSync(cscExe, ['/nologo', '/optimize+', `/out:${outExe}`, csPath], { stdio: 'inherit' });
  console.log('Compiled:', outExe);
}
