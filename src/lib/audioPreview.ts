import { useEffect, useSyncExternalStore } from 'react';

export interface AudioPreviewState {
  id: string | null;
  progress: number;
  playing: boolean;
}

let audio: HTMLAudioElement | null = null;
let currentId: string | null = null;
let currentUrl: string | null = null;

let state: AudioPreviewState = {
  id: null,
  progress: 0,
  playing: false,
};

const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

const updateState = (updates: Partial<AudioPreviewState>) => {
  state = {
    ...state,
    ...updates,
  };

  notify();
};

const cleanup = () => {
  if (!audio) return;

  audio.pause();
  audio.currentTime = 0;
  audio.ontimeupdate = null;
  audio.onended = null;
  audio.onerror = null;
};

export const audioPreview = {
  subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  getState(): AudioPreviewState {
    return state;
  },

  async toggle(id: string, url: string) {
    if (!url) return;

    if (currentId === id && audio) {
      if (state.playing) {
        audio.pause();
        updateState({ playing: false });
      } else {
        try {
          await audio.play();
          updateState({ playing: true });
        } catch {
          updateState({ playing: false });
        }
      }

      return;
    }

    cleanup();

    audio = new Audio(url);
    currentId = id;
    currentUrl = url;

    updateState({
      id,
      progress: 0,
      playing: false,
    });

    audio.ontimeupdate = () => {
      if (!audio || !audio.duration) return;

      updateState({
        progress: audio.currentTime / audio.duration,
      });
    };

    audio.onended = () => {
      updateState({
        progress: 0,
        playing: false,
      });
    };

    audio.onerror = () => {
      updateState({
        progress: 0,
        playing: false,
      });
    };

    try {
      await audio.play();
      updateState({ playing: true });
    } catch {
      updateState({ playing: false });
    }
  },

  seek(id: string, ratio: number) {
    if (!audio || currentId !== id || !audio.duration) return;

    const clamped = Math.max(0, Math.min(1, ratio));

    audio.currentTime = clamped * audio.duration;

    updateState({
      progress: clamped,
    });
  },

  stop(id?: string) {
    if (id !== undefined && currentId !== id) return;

    cleanup();

    audio = null;
    currentId = null;
    currentUrl = null;

    state = {
      id: null,
      progress: 0,
      playing: false,
    };

    notify();
  },

  getCurrentUrl() {
    return currentUrl;
  },
};

export function useAudioPreview(id: string, previewUrl?: string) {
  const state = useSyncExternalStore(
    audioPreview.subscribe,
    audioPreview.getState,
    audioPreview.getState
  );

  const isPlaying = state.id === id && state.playing;
  const progress = state.id === id ? state.progress : 0;

  const toggle = () => {
    if (!previewUrl) return;
    void audioPreview.toggle(id, previewUrl);
  };

  const seek = (ratio: number) => {
    audioPreview.seek(id, ratio);
  };

  useEffect(() => () => {
    audioPreview.stop(id);
  }, [id]);

  return {
    isPlaying,
    progress,
    toggle,
    seek,
  };
}
