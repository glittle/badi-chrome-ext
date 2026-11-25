let voices = [];
async function getVoicesListAsync() {
  if (!voices.length) {
    // console.log("Getting voices list 2");
    voices = await new Promise(function (resolve, reject) {
      const v = speechSynthesis.getVoices();
      if (v.length !== 0) {
        resolve(v);
      } else {
        speechSynthesis.addEventListener("voiceschanged", function () {
          const v2 = speechSynthesis.getVoices();
          resolve(v2);
        });
      }
    });
  }
  return voices;
}
