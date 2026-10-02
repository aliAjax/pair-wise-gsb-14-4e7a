import type { Directory } from "./types";

// 两个站组、三类账号：总部 / 区域主管 / 站端。
// 区域与站端账号只能交本组材料（groupId 作用域），由引擎强制。
export const DIRECTORY: Directory = {
  groups: [
    {
      id: "g-east",
      name: "华东A组",
      guns: [
        { id: "gun-01", label: "1号枪" },
        { id: "gun-02", label: "2号枪" },
        { id: "gun-03", label: "3号枪" },
        { id: "gun-04", label: "4号枪" }
      ]
    },
    {
      id: "g-north",
      name: "华北B组",
      guns: [
        { id: "gun-11", label: "11号枪" },
        { id: "gun-12", label: "12号枪" },
        { id: "gun-13", label: "13号枪" }
      ]
    }
  ],
  accounts: [
    { id: "u-hq", name: "总部调度", role: "hq", groupIds: null },
    { id: "u-east", name: "华东主管", role: "regional", groupIds: ["g-east"] },
    { id: "u-north", name: "华北主管", role: "regional", groupIds: ["g-north"] },
    { id: "s-east", name: "华东站端", role: "station", groupIds: ["g-east"] },
    { id: "s-north", name: "华北站端", role: "station", groupIds: ["g-north"] }
  ]
};

export function accountName(id: string): string {
  return DIRECTORY.accounts.find((a) => a.id === id)?.name ?? id;
}

export function groupName(id: string): string {
  return DIRECTORY.groups.find((g) => g.id === id)?.name ?? id;
}

export function gunLabel(groupId: string, gunId: string): string {
  const g = DIRECTORY.groups.find((x) => x.id === groupId);
  return g?.guns.find((x) => x.id === gunId)?.label ?? gunId;
}

export function groupOfGun(gunId: string): string | undefined {
  return DIRECTORY.groups.find((g) => g.guns.some((x) => x.id === gunId))?.id;
}
