import mux from 'mux-embed';

const extractHostname = mux.utils.extractHostname;

export default function initializeDashHandler (player, shaka, shakaLib) {
  let currentBitrate;
  const requestType = shakaLib.net.NetworkingEngine.RequestType;
  const categoryMap = shakaLib.util.Error.Category;
  const codeMap = shakaLib.util.Error.Code;
  const severityMap = shakaLib.util.Error.Severity;

  const getCurrentBitrate = () => {
    const tracks = shaka.getVariantTracks();
    const activeTracks = tracks && tracks.filter(({ active }) => active);
    const activeBitrates = activeTracks && activeTracks.map(({ bandwidth }) => bandwidth);

    return activeBitrates && activeBitrates.reduce((a, b) => a + b, 0);
  };

  const fireRenditionChange = () => {
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

  shaka.getNetworkingEngine().registerResponseFilter(function (type, response) {
    const responseEnd = mux.utils.now();

    if (response.fromCache || !type) return;

    let typeString = 'media';

    if (type === requestType.MANIFEST) {
      typeString = 'manifest';
    }
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

  const handleError = (error) => {
    const {code, category, message, severity} = error.detail;

    // shaka's VIDEO_ERROR overlaps with playback error listener
    if (code === codeMap.VIDEO_ERROR || severity === severityMap.RECOVERABLE) return;

    const errorCategory = Object.keys(categoryMap).find(key => categoryMap[key] === category);
    const errorCodeMessage = Object.keys(codeMap).find(key => codeMap[key] === code);
    const errorMessage = message !== undefined ? message : `Shaka Error: ${errorCategory}`;
    const payload = {
      request_start: error.timeStamp,
      request_error: errorCodeMessage,
      request_hostname: undefined,
      request_type: errorCategory,
      request_error_code: code,
      request_error_text: errorMessage
    };

    player.mux.emit('requestfailed', payload);
  };

  shaka.addEventListener('error', handleError);
  shaka.addEventListener('adaptation', () => fireRenditionChange());
  shaka.addEventListener('variantchanged', () => fireRenditionChange());
}
