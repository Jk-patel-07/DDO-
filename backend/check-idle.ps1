Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }
    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
}
'@ -ErrorAction SilentlyContinue

$idle = 0
$locked = $false
if (Get-Process LogonUI -ErrorAction SilentlyContinue) {
    $locked = $true
} else {
    try {
        $lii = New-Object Win32+LASTINPUTINFO
        $lii.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($lii)
        if ([Win32]::GetLastInputInfo([ref]$lii)) {
            $idle = [Environment]::TickCount - $lii.dwTime
        }
    } catch {
        $idle = 0
    }
}
Write-Output "$idle|$locked"
