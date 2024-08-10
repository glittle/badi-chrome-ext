browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "speakNow") {
    const title = request.title;
    document.title = title;

    const voices = await getVoicesListAsync();
    const voice = voices.find((v) => v.name === request.voiceName);

    const text = `${title}! ${request.text}.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;

    window.speechSynthesis.speak(utterance);

    utterance.onend = () => {
      window.close();
    };
  }
});
