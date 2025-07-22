// Importa o jsPDF - necessário para funcionar
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

// Variáveis de estado
let apiKey = "";
let mediaRecorder;
let socket;
let isRecording = false;
let isPaused = false;
let fullTranscript = "";
let startTime, endTime;

const ELEVENLABS_WEBSOCKET_URL =
  "wss://api.elevenlabs.io/v1/speech-to-text/stream";

// ---- Lógica do Modal da API Key ----
submitApiKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    apiKey = key;
    apiKeyModal.style.display = "none";
    startBtn.disabled = false;
  } else {
    alert("Por favor, insira uma chave de API válida.");
  }
});

// ---- Lógica de Gravação ----
startBtn.addEventListener("click", startRecording);
pauseBtn.addEventListener("click", togglePause);
stopBtn.addEventListener("click", stopRecording);
pdfBtn.addEventListener("click", generatePDF);

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    setupWebSocket();

    socket.onopen = () => {
      // Configuração da conexão com a API
      socket.send(
        JSON.stringify({
          audio_format: "webm", // Formato padrão do MediaRecorder
          model: "eleven_multilingual_v2", // Escolha o modelo
          api_key: apiKey,
        })
      );

      mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ end_of_stream: true }));
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(500); // Envia dados a cada 500ms

      // Atualiza UI
      isRecording = true;
      startTime = new Date();
      startTimeSpan.textContent = startTime.toLocaleTimeString();
      endTimeSpan.textContent = "--:--:--";
      transcriptDisplay.textContent = "";
      fullTranscript = "";
      statusDiv.textContent = "Gravando... fale agora.";
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
      pdfBtn.disabled = true;
    };
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
    mediaRecorder.resume();
    isPaused = false;
    pauseBtn.textContent = "Pausar Gravação";
    statusDiv.textContent = "Gravando...";
  } else {
    mediaRecorder.pause();
    isPaused = true;
    pauseBtn.textContent = "Retomar Gravação";
    statusDiv.textContent = "Gravação pausada.";
  }
}

function stopRecording() {
  if (!isRecording) return;

  mediaRecorder.stop();
  isRecording = false;
  isPaused = false;
  endTime = new Date();
  endTimeSpan.textContent = endTime.toLocaleTimeString();

  // Atualiza UI
  statusDiv.textContent = "Processando transcrição final...";
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = "Pausar Gravação";
  stopBtn.disabled = true;
  // O botão de PDF será habilitado quando a conexão fechar
}

function setupWebSocket() {
  socket = new WebSocket(ELEVENLABS_WEBSOCKET_URL);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Se a transcrição não for final, acumula o texto
    if (data.text && !data.is_final) {
      transcriptDisplay.textContent = fullTranscript + data.text;
    }

    // Quando uma transcrição final é recebida, anexa ao histórico
    if (data.is_final) {
      fullTranscript += data.text + " ";
      transcriptDisplay.textContent = fullTranscript;
    }
  };

  socket.onclose = (event) => {
    console.log("WebSocket fechado:", event);
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    statusDiv.textContent = "Gravação finalizada. Pronto para gerar o PDF.";
    pdfBtn.disabled = false;
  };

  socket.onerror = (error) => {
    console.error("Erro no WebSocket:", error);
    statusDiv.textContent = "Ocorreu um erro na conexão. Verifique o console.";
    alert(
      "Erro na conexão. Verifique sua chave de API e a conexão com a internet."
    );
    stopRecording();
  };
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
  doc.text("Transcrição de Áudio", pageWidth / 2, margin, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Início da Gravação: ${startTime.toLocaleString()}`,
    margin,
    margin + 10
  );
  doc.text(`Fim da Gravação: ${endTime.toLocaleString()}`, margin, margin + 15);

  doc.setLineWidth(0.5);
  doc.line(margin, margin + 20, pageWidth - margin, margin + 20);

  doc.setFontSize(12);
  const textLines = doc.splitTextToSize(fullTranscript, usableWidth);
  doc.text(textLines, margin, margin + 30);

  doc.save("transcricao.pdf");
}
