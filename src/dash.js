import mux from 'mux-embed';
const extractHostname = mux.utils.extractHostname;

export default function initializeDashHandler (player, shaka) {
  let currentBitrate;
  let PLAYER_LISTENERS = {};
  const getCurrentBitrate = function () {
    const tracks = shaka.getVariantTracks();
    const activeTracks = tracks && tracks.filter(({ active }) => active);
    const activeBitrates = activeTracks && activeTracks.map(({ bandwidth }) => bandwidth);

    return activeBitrates && activeBitrates.reduce((a, b) => a + b, 0);
  };

  const fireRenditionChange = function () {
    const newBitrate = getCurrentBitrate();

    if (newBitrate && newBitrate !== currentBitrate) {
      currentBitrate = newBitrate;

      player.mux.emit('renditionchange', {
        video_source_bitrate: currentBitrate
      });
    }
  };
  PLAYER_LISTENERS['adaptation'] = function (evt) {
    fireRenditionChange();
  };
  shaka.addEventListener('adaptation', PLAYER_LISTENERS['adaptation']);

  const requestTypes = {
    0: 'manifest',
    1: 'media'
  };

  shaka.getNetworkingEngine().registerResponseFilter(function (type, response) {
    const responseEnd = mux.utils.now();

    if (response.fromCache) return;
    const typeString = requestTypes[type && type.toString()];

    if (!type) return;
    const bytes = response.data.byteLength;

    const payload = {
      request_bytes_loaded: bytes,
      request_hostname: extractHostname(response.uri),
      request_response_headers: response.headers,
      request_type: typeString,
      request_start: (response.timeMs ? responseEnd - response.timeMs : undefined),
      request_response_end: responseEnd
    };

    player.mux.emit('requestcompleted', payload);
  });
}
