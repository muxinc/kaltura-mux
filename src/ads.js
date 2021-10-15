export default function initializeAdEvents (player) {
  const AdsEventMap = new Map();

  AdsEventMap.set('adresponse', player.Event.AD_LOADED);
  AdsEventMap.set('adbreakstart', player.Event.AD_BREAK_START);
  AdsEventMap.set('adplaying', player.Event.AD_STARTED);
  AdsEventMap.set('adpause', player.Event.AD_PAUSED);
  AdsEventMap.set('adfirstquartile', player.Event.AD_FIRST_QUARTILE);
  AdsEventMap.set('admidpoint', player.Event.AD_MIDPOINT);
  AdsEventMap.set('adthirdquartile', player.Event.AD_THIRD_QUARTILE);
  AdsEventMap.set('adended', player.Event.AD_COMPLETED);
  AdsEventMap.set('adbreakend', player.Event.AD_BREAK_END);
  AdsEventMap.set('aderror', player.Event.AD_ERROR);

  AdsEventMap.forEach((kalturaEvent, muxEvent) => {
    player.addEventListener(kalturaEvent, (event) => {
      let data = {};

      if (kalturaEvent === player.Event.AD_LOADED) {
        if (player.plugins.ima && player.plugins.ima.config.adTagUrl) {
          const ad_tag_url = player.plugins.ima.config.adTagUrl;

          data.ad_tag_url = ad_tag_url;
        }
      } if (kalturaEvent === player.Event.AD_STARTED) {
        const ad_asset_url = player.ads.getAd()._url;

        data.ad_asset_url = ad_asset_url;
      }
      player.mux.emit(muxEvent, data);
    });
  });
}
