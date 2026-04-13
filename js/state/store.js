export function createStore(reducer, preloadedState) {
  let state = preloadedState;
  /** @type {Array<() => void>} */
  const listeners = [];

  function getState() {
    return state;
  }

  function dispatch(action) {
    state = reducer(state, action);
    for (const l of listeners.slice()) l();
    return action;
  }

  function subscribe(listener) {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  dispatch({ type: '@@INIT' });
  return { getState, dispatch, subscribe };
}
