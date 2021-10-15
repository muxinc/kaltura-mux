export default function initializeKalturaImaEvents (player) {
  const muxEvent = 'adresponse';
  const kalturaEvent = player.Event.AD_LOADED;

  player.addEventListener(kalturaEvent, (event) => {
    let data = {};
    const ad_tag_url = player.plugins.ima.config.adTagUrl;

    if (ad_tag_url) {
      data.ad_tag_url = ad_tag_url;
    }
    player.mux.emit(muxEvent, data);
  });
}
