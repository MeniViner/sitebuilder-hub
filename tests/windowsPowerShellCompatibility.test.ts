import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { scanPowerShell51, scanPowerShellTree } from "../scripts/mongo-consolidation/check-windows-powershell-compatibility.mjs";

describe("Windows PowerShell 5.1 static compatibility", () => {
  it("accepts all maintained PowerShell scripts", () => {
    expect(scanPowerShellTree("scripts/mongo-consolidation")).toEqual([]);
  });

  it("rejects known PowerShell 7-only syntax", () => {
    expect(scanPowerShell51("$value = $null ?? 'fallback'", "fixture.ps1")).toEqual(["fixture.ps1:1: null-coalescing operator"]);
    expect(scanPowerShell51("Get-ChildItem | ForEach-Object -Parallel { $_ }", "fixture.ps1")).toEqual(["fixture.ps1:1: PowerShell parallel foreach"]);
  });

  it("uses the Windows PowerShell 5.1 compatible relative-path helper", () => {
    const collector = fs.readFileSync("scripts/mongo-consolidation/collect-windows-evidence.ps1", "utf8");
    expect(collector).toContain("function Get-CompatibilityRelativePath");
    expect(collector).not.toContain("[IO.Path]::GetRelativePath");
  });
});
