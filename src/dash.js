import mux from 'mux-embed';

const extractHostname = mux.utils.extractHostname;

export default function initializeDashHandler (player, shaka, shakaLib) {

  function trackRenditionEvents () {
    let currentBitrate;

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

    shaka.addEventListener('adaptation', () => fireRenditionChange());
    shaka.addEventListener('variantchanged', () => fireRenditionChange());
  }
  function trackNetworkEvents () {
    const requestType = shakaLib.net.NetworkingEngine.RequestType;

    shaka.getNetworkingEngine().registerResponseFilter(function (type, response) {
      const responseEnd = mux.utils.now();

      if (response.fromCache || !type) return;

      let typeString;

      if (type === requestType.MANIFEST) {
        typeString = 'manifest';
      }
      if (type || type === requestType.SEGMENT) {
        typeString = 'media';
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
      console.log('entered handle dash error', {error});
      const errorCategoryMap = shakaLib.util.Error.Category;
      const errorCodeMap = shakaLib.util.Error.Code;
      const category = Object.keys(errorCategoryMap).find(key => errorCategoryMap[key] === error.detail.category);
      const message = Object.keys(errorCodeMap).find(key => errorCodeMap[key] === error.detail.code);

      console.log("ERROR CATEGORY",category);

      const payload = {
      //   request_error: error + '_' + event.id + '_' + request.type,
        request_url: error.data,
      //   request_hostname: extractHostname(event.url),
        request_type: category,
        request_error_code: error.code,
        request_error_type: message
      // }
      };
      player.mux.emit('requestfailed', payload);
    };
    shaka.addEventListener('error', (err) => { handleError(err); });
  }
  trackRenditionEvents();
  trackNetworkEvents();
}
