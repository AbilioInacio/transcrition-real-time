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

// --- Constantes e Variáveis de Estado ---
const RECORDING_INTERVAL_MS = 10000; // Envia áudio a cada 4 segundos
let apiKey = "";
let mediaRecorder;
let stream; // O stream do microfone precisa ser acessível globalmente
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
    // Pede acesso ao microfone
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    isRecording = true;
    isPaused = false;

    // Reseta o estado para uma nova gravação
    startTime = new Date();
    startTimeSpan.textContent = startTime.toLocaleTimeString();
    endTimeSpan.textContent = "--:--:--";
    fullTranscript = "";
    transcriptDisplay.textContent = "";

    updateUIForRecordingState();

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    // Evento chamado a cada X ms com um pedaço de áudio
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && !isPaused) {
        transcribeAudioChunk(event.data);
      }
    };

    // Inicia a gravação e define o intervalo para o ondataavailable
    mediaRecorder.start(RECORDING_INTERVAL_MS);
  } catch (error) {
    console.error("Erro ao iniciar a gravação:", error);
    alert(
      "Não foi possível acessar o microfone. Verifique as permissões do navegador."
    );
    resetState();
  }
}

function togglePause() {
  if (!isRecording) return;

  isPaused = !isPaused;

  if (isPaused) {
    mediaRecorder.pause();
    statusDiv.textContent = "Gravação pausada.";
  } else {
    mediaRecorder.resume();
    statusDiv.textContent = "Gravando...";
  }
  updateUIForRecordingState();
}

function stopRecording() {
  if (!isRecording) return;

  // Para o gravador, o que pode acionar um último ondataavailable
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  // ESSENCIAL: Para as trilhas do microfone para desligá-lo
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  endTime = new Date();
  endTimeSpan.textContent = endTime.toLocaleTimeString();

  resetState();
}

// Reseta o estado da UI e das variáveis
function resetState() {
  isRecording = false;
  isPaused = false;
  updateUIForRecordingState();
  statusDiv.textContent = "Gravação finalizada. Pronto para gerar o PDF.";
}

// Centraliza a lógica de atualização da UI
function updateUIForRecordingState() {
  startBtn.disabled = isRecording;
  pauseBtn.disabled = !isRecording;
  stopBtn.disabled = !isRecording;
  pdfBtn.disabled = isRecording || fullTranscript.length === 0;

  if (isRecording) {
    pauseBtn.textContent = isPaused ? "Retomar Gravação" : "Pausar Gravação";
  } else {
    pauseBtn.textContent = "Pausar Gravação";
  }
}

// ---- Função Principal de Transcrição por Pedaços ----
// SUBSTITUA A FUNÇÃO ANTIGA POR ESTA NOVA VERSÃO
async function transcribeAudioChunk(audioChunkBlob) {
  // --- GUARDA DE SEGURANÇA ---
  // Se o pedaço de áudio for muito pequeno (menos de 100 bytes), ignore-o.
  // Isso evita o envio de chunks vazios ou silenciosos.
  if (audioChunkBlob.size < 100) {
    return;
  }

  console.log(`Enviando pedaço de áudio com ${audioChunkBlob.size} bytes.`); // Para depuração

  try {
    const base64Audio = await blobToBase64(audioChunkBlob);
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const requestBody = {
      systemInstruction: {
        parts: [
          {
            text: "Você é um assistente especialista em transcrição de áudio. Sua única tarefa é transcrever o áudio fornecido para texto em português do Brasil. Responda APENAS com o texto transcrito, sem adicionar nenhuma palavra, comentário ou frase introdutória.",
          },
        ],
      },
      contents: [
        {
          parts: [
            { inline_data: { mime_type: "audio/webm", data: base64Audio } },
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
      console.error("Erro detalhado da API:", errorBody);
      throw new Error(
        `Erro da API (${response.status}): ${errorBody.error.message}`
      );
    }

    const data = await response.json();

    if (
      data.candidates &&
      data.candidates[0].content &&
      data.candidates[0].content.parts
    ) {
      const transcript = data.candidates[0].content.parts[0].text;
      fullTranscript += transcript.trim() + " ";
      transcriptDisplay.textContent = fullTranscript;
    } else {
      console.warn("Recebida uma resposta vazia ou inesperada da API:", data);
    }
  } catch (error) {
    console.error("Erro na transcrição:", error);
    statusDiv.textContent = `Erro na transcrição. Verifique o console para detalhes. ${error}`;
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
  doc.text("Transcrição de Áudio com Gemini", pageWidth / 2, margin, {
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
