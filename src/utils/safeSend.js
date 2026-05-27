export const safeSend = (target, ...args) => {
  if (!target || typeof target.send !== 'function') {
    return false;
  }

  try {
    target.send(...args);
    return true;
  } catch {
    return false;
  }
};

export const getSafeElectronSender = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.electron?.ipcRenderer || window.electron || null;
};
