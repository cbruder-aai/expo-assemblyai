const {
  withInfoPlist,
  withAndroidManifest,
  AndroidConfig,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const pkg = require('./package.json');

const DEFAULT_MIC_MESSAGE =
  'This app uses the microphone to stream audio to AssemblyAI for live transcription and voice conversations.';

/**
 * Expo config plugin for `expo-assemblyai`.
 *
 * Two-way audio needs the microphone on both platforms and background-audio
 * capability on iOS (so a voice-agent session survives the screen locking). This
 * wires those into the native projects at prebuild so app authors don't hand-edit
 * Info.plist / AndroidManifest.xml. Usage in app.json:
 *
 *   ["expo-assemblyai", { "microphonePermission": "…", "enableBackgroundAudio": true }]
 */
const withAssemblyAI = (config, props = {}) => {
  const micMessage = props.microphonePermission || DEFAULT_MIC_MESSAGE;

  // iOS: microphone usage string + optional background audio mode.
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSMicrophoneUsageDescription =
      cfg.modResults.NSMicrophoneUsageDescription || micMessage;
    if (props.enableBackgroundAudio) {
      const modes = new Set(cfg.modResults.UIBackgroundModes || []);
      modes.add('audio');
      cfg.modResults.UIBackgroundModes = Array.from(modes);
    }
    return cfg;
  });

  // Android: RECORD_AUDIO + MODIFY_AUDIO_SETTINGS (echo cancellation / routing).
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
  ]);

  if (props.enableBackgroundAudio) {
    config = withAndroidManifest(config, (cfg) => {
      const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        app,
        'expo.modules.assemblyai.BACKGROUND_AUDIO',
        'true'
      );
      return cfg;
    });
  }

  return config;
};

module.exports = createRunOncePlugin(withAssemblyAI, pkg.name, pkg.version);
