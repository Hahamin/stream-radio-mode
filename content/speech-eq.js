/**
 * Stream Radio Mode — 대사 중심 EQ
 *
 * 라디오 모드에서만 attach되고, 사용자가 켜면 Web Audio API로
 * 저역을 정리하고 2~4kHz 대역을 살짝 강조해 목소리를 또렷하게 만든다.
 */

(() => {
  const STORAGE_KEYS = ['speechEqEnabled', 'speechEqPreset'];
  const PRESET_ORDER = ['clarity', 'bass-cut', 'night'];
  const PRESETS = {
    clarity: {
      label: '선명',
      highpass: { frequency: 130, q: 0.8 },
      lowshelf: { frequency: 220, gain: -2.2 },
      presence: { frequency: 2400, q: 1.0, gain: 3.4 },
      articulation: { frequency: 4100, q: 1.4, gain: 2.0 },
      highshelf: { frequency: 7600, gain: -1.0 },
      compressor: { threshold: -18, knee: 12, ratio: 2.2, attack: 0.003, release: 0.18 },
      outputGain: 0.94,
    },
    'bass-cut': {
      label: '저음컷',
      highpass: { frequency: 170, q: 0.85 },
      lowshelf: { frequency: 190, gain: -4.4 },
      presence: { frequency: 2150, q: 1.0, gain: 2.8 },
      articulation: { frequency: 3600, q: 1.2, gain: 1.4 },
      highshelf: { frequency: 6800, gain: -1.8 },
      compressor: { threshold: -20, knee: 10, ratio: 2.0, attack: 0.004, release: 0.16 },
      outputGain: 0.9,
    },
    night: {
      label: '야간',
      highpass: { frequency: 110, q: 0.75 },
      lowshelf: { frequency: 210, gain: -2.6 },
      presence: { frequency: 2050, q: 0.9, gain: 2.4 },
      articulation: { frequency: 3300, q: 1.1, gain: 1.2 },
      highshelf: { frequency: 6400, gain: -2.8 },
      compressor: { threshold: -24, knee: 16, ratio: 3.0, attack: 0.002, release: 0.22 },
      outputGain: 0.88,
    },
  };

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

  const SpeechEQ = {
    _enabled: false,
    _presetKey: PRESET_ORDER[0],
    _loaded: false,
    _loadPromise: null,
    _audioContext: null,
    _attachedVideo: null,
    _activeSource: null,
    _mediaSourceMap: new WeakMap(),
    _nodes: null,

    async init() {
      if (this._loaded) return;
      if (this._loadPromise) return this._loadPromise;

      this._loadPromise = chrome.storage.local.get(STORAGE_KEYS)
        .then((stored) => {
          this._enabled = Boolean(stored.speechEqEnabled);
          this._presetKey = this._normalizePresetKey(stored.speechEqPreset);
          this._loaded = true;
        })
        .catch(() => {
          this._enabled = false;
          this._presetKey = PRESET_ORDER[0];
          this._loaded = true;
        })
        .finally(() => {
          this._loadPromise = null;
        });

      return this._loadPromise;
    },

    getState() {
      const preset = this._getPreset();
      return {
        enabled: this._enabled,
        preset: this._presetKey,
        label: preset.label,
        supported: Boolean(AudioContextCtor),
        attached: Boolean(this._attachedVideo),
        activeProcessing: Boolean(
          this._enabled
          && this._attachedVideo
          && this._activeSource
          && this._audioContext?.state === 'running'
        ),
        contextState: this._audioContext?.state || 'idle',
      };
    },

    async attach(video) {
      await this.init();
      if (!(video instanceof HTMLMediaElement)) {
        this._attachedVideo = null;
        return this.getState();
      }

      this._attachedVideo = video;
      if (!this._enabled) {
        return this.getState();
      }

      await this._connect(video, true);
      return this.getState();
    },

    async detach() {
      await this.init();

      if (
        this._attachedVideo instanceof HTMLMediaElement
        && this._audioContext
        && this._mediaSourceMap.has(this._attachedVideo)
      ) {
        await this._connect(this._attachedVideo, false);
      }

      this._attachedVideo = null;
      return this.getState();
    },

    async toggle(video = this._attachedVideo) {
      await this.init();
      this._enabled = !this._enabled;
      await this._persist();

      if (video instanceof HTMLMediaElement) {
        await this._connect(video, this._enabled);
      }

      return this.getState();
    },

    async cyclePreset(video = this._attachedVideo) {
      await this.init();

      const currentIndex = PRESET_ORDER.indexOf(this._presetKey);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % PRESET_ORDER.length : 0;
      this._presetKey = PRESET_ORDER[nextIndex];
      await this._persist();

      if (this._enabled && video instanceof HTMLMediaElement) {
        await this._connect(video, true);
      }

      return this.getState();
    },

    _normalizePresetKey(presetKey) {
      return Object.prototype.hasOwnProperty.call(PRESETS, presetKey)
        ? presetKey
        : PRESET_ORDER[0];
    },

    _getPreset() {
      return PRESETS[this._normalizePresetKey(this._presetKey)];
    },

    async _persist() {
      return chrome.storage.local.set({
        speechEqEnabled: this._enabled,
        speechEqPreset: this._presetKey,
      });
    },

    async _connect(video, processed) {
      const context = await this._ensureContext({ requireRunning: processed });
      if (!context) {
        return;
      }

      const source = this._getOrCreateSource(video, context);
      if (!source) {
        return;
      }

      this._disconnectGraph();

      if (processed) {
        const nodes = this._ensureNodes(context);
        this._applyPreset(nodes, this._getPreset());

        source.connect(nodes.input);
        nodes.input.connect(nodes.highpass);
        nodes.highpass.connect(nodes.lowshelf);
        nodes.lowshelf.connect(nodes.presence);
        nodes.presence.connect(nodes.articulation);
        nodes.articulation.connect(nodes.highshelf);
        nodes.highshelf.connect(nodes.compressor);
        nodes.compressor.connect(nodes.output);
        nodes.output.connect(context.destination);
      } else {
        source.connect(context.destination);
      }

      this._activeSource = source;
      this._attachedVideo = video;
    },

    _disconnectGraph() {
      if (this._activeSource) {
        try {
          this._activeSource.disconnect();
        } catch (_) {}
      }

      if (!this._nodes) {
        return;
      }

      Object.values(this._nodes).forEach((node) => {
        try {
          node.disconnect();
        } catch (_) {}
      });
    },

    async _ensureContext(options = {}) {
      const { requireRunning = false } = options;

      if (!AudioContextCtor) {
        return null;
      }

      if (!this._audioContext) {
        this._audioContext = new AudioContextCtor();
      }

      if (this._audioContext.state === 'suspended') {
        try {
          await this._audioContext.resume();
        } catch (_) {}
      }

      if (requireRunning && this._audioContext.state !== 'running') {
        return null;
      }

      return this._audioContext;
    },

    _getOrCreateSource(video, context) {
      const existing = this._mediaSourceMap.get(video);
      if (existing) {
        return existing;
      }

      try {
        const source = context.createMediaElementSource(video);
        this._mediaSourceMap.set(video, source);
        return source;
      } catch (error) {
        console.warn('[StreamRadio] 대사 EQ source 생성 실패:', error);
        return null;
      }
    },

    _ensureNodes(context) {
      if (this._nodes) {
        return this._nodes;
      }

      const input = context.createGain();

      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass';

      const lowshelf = context.createBiquadFilter();
      lowshelf.type = 'lowshelf';

      const presence = context.createBiquadFilter();
      presence.type = 'peaking';

      const articulation = context.createBiquadFilter();
      articulation.type = 'peaking';

      const highshelf = context.createBiquadFilter();
      highshelf.type = 'highshelf';

      const compressor = context.createDynamicsCompressor();
      const output = context.createGain();

      this._nodes = {
        input,
        highpass,
        lowshelf,
        presence,
        articulation,
        highshelf,
        compressor,
        output,
      };

      return this._nodes;
    },

    _applyPreset(nodes, preset) {
      nodes.input.gain.value = 1;

      nodes.highpass.frequency.value = preset.highpass.frequency;
      nodes.highpass.Q.value = preset.highpass.q;

      nodes.lowshelf.frequency.value = preset.lowshelf.frequency;
      nodes.lowshelf.gain.value = preset.lowshelf.gain;

      nodes.presence.frequency.value = preset.presence.frequency;
      nodes.presence.Q.value = preset.presence.q;
      nodes.presence.gain.value = preset.presence.gain;

      nodes.articulation.frequency.value = preset.articulation.frequency;
      nodes.articulation.Q.value = preset.articulation.q;
      nodes.articulation.gain.value = preset.articulation.gain;

      nodes.highshelf.frequency.value = preset.highshelf.frequency;
      nodes.highshelf.gain.value = preset.highshelf.gain;

      nodes.compressor.threshold.value = preset.compressor.threshold;
      nodes.compressor.knee.value = preset.compressor.knee;
      nodes.compressor.ratio.value = preset.compressor.ratio;
      nodes.compressor.attack.value = preset.compressor.attack;
      nodes.compressor.release.value = preset.compressor.release;

      nodes.output.gain.value = preset.outputGain;
    },
  };

  window.__speechEQ = SpeechEQ;
})();
