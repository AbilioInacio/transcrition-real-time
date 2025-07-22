// Importa o jsPDF
const { jsPDF } = window.jspdf;

// Elementos do DOM
const apiKeyModal = document.getElementById("api-key-modal");
const apiKeyInput = document.getElementById("api-key-input");
const submitApiKeyBtn = document.getElementById("submit-api-key");
const startBtn = document.getElementById("start-button");
const pauseBtn = document.getElementById("pause-button");
const stopBtn = document.getElementById("stop-button");
const pdfBtn = document.getElementById("pdf-button");
const statusDiv = document.getElementById("status");
const transcriptDisplay = document.getElementById("transcript-display");
const startTimeSpan = document.getElementById("start-time");
const endTimeSpan = document.getElementById("end-time");

// --- Variáveis de Estado ---
let apiKey = "";
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let isPaused = false;
let fullTranscript = "";
let startTime, endTime;

// ---- Lógica do Modal da API Key ----
submitApiKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    apiKey = key;
    apiKeyModal.style.display = "none";
    startBtn.disabled = false;
  } else {
    alert("Por favor, insira uma Chave de API do Google AI Studio válida.");
  }
});

// ---- Lógica de Gravação ----
startBtn.addEventListener("click", startRecording);
pauseBtn.addEventListener("click", togglePause);
stopBtn.addEventListener("click", stopRecording);
pdfBtn.addEventListener("click", generatePDF);

async function startRecording() {
  if (isRecording) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioChunks = []; // Limpa chunks anteriores
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      // Quando a gravação para (por pausa ou finalização), envia para a API
      if (audioChunks.length > 0) {
        statusDiv.textContent = "Transcrevendo áudio... Por favor, aguarde.";
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
      }
      // Para a trilha do microfone apenas quando finalizado
      if (!isRecording) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };

    mediaRecorder.start();
    isRecording = true;
    isPaused = false;

    // Atualiza UI
    if (!startTime) {
      // Define a hora de início apenas na primeira vez
      startTime = new Date();
      startTimeSpan.textContent = startTime.toLocaleTimeString();
    }
    statusDiv.textContent = "Gravando... Fale agora.";
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = "Pausar Gravação";
    stopBtn.disabled = false;
    pdfBtn.disabled = true;
  } catch (error) {
    console.error("Erro ao iniciar a gravação:", error);
    alert(
      "Não foi possível acessar o microfone. Verifique as permissões do navegador."
    );
  }
}

function togglePause() {
  if (!isRecording) return;

  if (isPaused) {
    // Se estava pausado, retoma a gravação
    isPaused = false;
    startRecording(); // Inicia uma nova gravação que será anexada
    pauseBtn.textContent = "Pausar Gravação";
    statusDiv.textContent = "Gravando...";
  } else {
    // Se estava gravando, pausa
    isPaused = true;
    mediaRecorder.stop(); // Isso vai acionar o onstop e enviar para a API
    pauseBtn.textContent = "Retomar Gravação";
    statusDiv.textContent = "Gravação pausada. Processando trecho...";
  }
}

function stopRecording() {
  if (!isRecording) return;

  isRecording = false;
  isPaused = false;
  if (mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }

  endTime = new Date();
  endTimeSpan.textContent = endTime.toLocaleTimeString();

  // Atualiza UI
  statusDiv.textContent = "Gravação finalizada. Pronto para gerar o PDF.";
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = "Pausar Gravação";
  stopBtn.disabled = true;
  pdfBtn.disabled = false;
}

// ---- Função Principal de Transcrição com a API do Gemini ----
async function transcribeAudio(audioBlob) {
  try {
    const base64Audio = await blobToBase64(audioBlob);

    // Use um modelo recente que suporte áudio, como o gemini-1.5-flash
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: "Transcreva este áudio em português do Brasil:" },
            {
              inline_data: {
                mime_type: "audio/webm",
                data: base64Audio,
              },
            },
          ],
        },
      ],
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`Erro da API: ${errorBody.error.message}`);
    }

    const data = await response.json();
    const transcript = data.candidates[0].content.parts[0].text;

    fullTranscript += transcript + " ";
    transcriptDisplay.textContent = fullTranscript;

    if (isRecording && !isPaused) {
      statusDiv.textContent = "Gravando...";
    } else if (isPaused) {
      statusDiv.textContent =
        "Gravação pausada. Clique em Retomar para continuar.";
    }
  } catch (error) {
    console.error("Erro na transcrição:", error);
    statusDiv.textContent = `Erro na transcrição: ${error.message}`;
    stopRecording(); // Para tudo em caso de erro
  }
}

// Função auxiliar para converter o Blob de áudio para Base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function generatePDF() {
  if (!fullTranscript) {
    alert("Não há transcrição para gerar o PDF.");
    return;
  }

  const doc = new jsPDF();
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - 2 * margin;

  doc.setFont("helvetica", "bold");
  doc.text("Transcrição de Áudio com InácioTECH", pageWidth / 2, margin, {
    align: "center",
  });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Início da Gravação: ${startTime ? startTime.toLocaleString() : "N/A"}`,
    margin,
    margin + 10
  );
  doc.text(
    `Fim da Gravação: ${endTime ? endTime.toLocaleString() : "N/A"}`,
    margin,
    margin + 15
  );

  doc.setLineWidth(0.5);
  doc.line(margin, margin + 20, pageWidth - margin, margin + 20);

  doc.setFontSize(12);
  const textLines = doc.splitTextToSize(fullTranscript, usableWidth);
  doc.text(textLines, margin, margin + 30);

  doc.save("transcricao-gemini.pdf");
}
