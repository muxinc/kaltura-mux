export default function initializeDashHandler (player, shaka) {
  let currentBitrate;

  const getCurrentBitrate = function () {
    const tracks = shaka.getVariantTracks();
    const activeTracks = tracks && tracks.filter(({ active }) => active);
    const activeBitrates = activeTracks && activeTracks.map(({ bandwidth }) => bandwidth);

    return activeBitrates && activeBitrates.reduce((a, b) => a + b, 0);
  };

  const fireRenditionChange = function () {
    const newBitrate = getCurrentBitrate();
    const {width: video_width, height: video_height} = shaka.getStats();

    if (newBitrate && newBitrate !== currentBitrate) {
      currentBitrate = newBitrate;

      player.mux.emit('renditionchange', {
        video_source_bitrate: currentBitrate,
        video_source_width: video_width,
        video_source_height: video_height
      });
    }
  };

  shaka.addEventListener('adaptation', () => fireRenditionChange());
  shaka.addEventListener('variantchanged', () => fireRenditionChange());
}
