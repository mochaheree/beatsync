const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  connect: call('osc:connect'),
  disconnect: call('osc:disconnect'),
  status: call('osc:status'),
  send: call('osc:send'),
  playClip: call('osc:playClip'),
  stopClip: call('osc:stopClip'),
  setTempo: call('osc:setTempo'),
  setTempoNormalised: call('osc:setTempoNormalised'),
  resync: call('osc:resync'),
  tempoTap: call('osc:tempoTap'),
  copyText: call('system:copyText'),
});
