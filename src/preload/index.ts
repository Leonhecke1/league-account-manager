import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getAccounts:     ()                                              => ipcRenderer.invoke("accounts:get"),
  addAccount:      (account: object)                              => ipcRenderer.invoke("accounts:add", account),
  updateAccount:   (id: string, patch: object)                    => ipcRenderer.invoke("accounts:update", id, patch),
  removeAccount:   (id: string)                                   => ipcRenderer.invoke("accounts:remove", id),
  fetchAccountData:(id: string, riotId: string, platform: string) => ipcRenderer.invoke("riot:fetch", id, riotId, platform),
  getCache:        ()                                             => ipcRenderer.invoke("cache:get"),
  setCache:        (id: string, data: object)                     => ipcRenderer.invoke("cache:set", id, data),
  getSettings:     ()                                             => ipcRenderer.invoke("settings:get"),
  saveSettings:    (settings: object)                             => ipcRenderer.invoke("settings:save", settings),
});
