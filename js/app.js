


//webkitURL is deprecated but nevertheless
URL = window.URL || window.webkitURL;

var gumStream; 						//stream from getUserMedia()
var recorder; 						//WebAudioRecorder object
var input; 							//MediaStreamAudioSourceNode  we'll be recording
var encodingType; 					//holds selected encoding for resulting audio (file)
var encodeAfterRecord = true;       // when to encode

// shim for AudioContext when it's not avb. 
var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext; //new audio context to help us record

var encodingTypeSelect = document.getElementById("encodingTypeSelect");
var recordButton = document.getElementById("recordButton");
var stopButton = document.getElementById("stopButton");
var sendButton = document.getElementById("sendButton");

//add events to those 3 buttons
recordButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", stopRecording);
sendButton.addEventListener('click', sendMessage);

function startRecording() {
	console.log("startRecording() called");

	/*
		Simple constraints object, for more advanced features see
		https://addpipe.com/blog/audio-constraints-getusermedia/
	*/

	var constraints = { audio: true, video: false }
	/*
		We're using the standard promise based getUserMedia() 
		https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
*/

	navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
		/* __log("getUserMedia() success, stream created, initializing WebAudioRecorder..."); */

		/*
			create an audio context after getUserMedia is called
			sampleRate might change after getUserMedia is called, like it does on macOS when recording through AirPods
			the sampleRate defaults to the one set in your OS for your playback device

		*/
		audioContext = new AudioContext();

		//update the format 
		document.getElementById("formats").innerHTML = "Format: 2 channel " + encodingTypeSelect.options[encodingTypeSelect.selectedIndex].value + " @ " + audioContext.sampleRate / 1000 + "kHz"

		//assign to gumStream for later use
		gumStream = stream;

		/* use the stream */
		input = audioContext.createMediaStreamSource(stream);

		//stop the input from playing back through the speakers
		//input.connect(audioContext.destination)

		//get the encoding 
		encodingType = encodingTypeSelect.options[encodingTypeSelect.selectedIndex].value;

		//disable the encoding selector
		encodingTypeSelect.disabled = true;

		recorder = new WebAudioRecorder(input, {
			workerDir: "js/", // must end with slash
			encoding: encodingType,
			numChannels: 2, //2 is the default, mp3 encoding supports only 2
			onEncoderLoading: function (recorder, encoding) {
				// show "loading encoder..." display
				/* __log("Loading " + encoding + " encoder..."); */
			},
			onEncoderLoaded: function (recorder, encoding) {
				// hide "loading encoder..." display
				/* __log(encoding + " encoder loaded"); */
			}
		});

		recorder.onComplete = function (recorder, blob) {
			/* __log("Encoding complete"); */
			createDownloadLink(blob, recorder.encoding);
			encodingTypeSelect.disabled = false;
		}

		recorder.setOptions({
			timeLimit: 120,
			encodeAfterRecord: encodeAfterRecord,
			ogg: { quality: 0.5 },
			mp3: { bitRate: 160 }
		});

		//start the recording process
		recorder.startRecording();

		/* __log("Recording started"); */

	}).catch(function (err) {
		//enable the record button if getUSerMedia() fails
		recordButton.disabled = false;
		stopButton.disabled = true;
		sendButton.disabled = true;
		console.log('Error:', err);
	});

	//disable the record button
	recordButton.disabled = true;
	stopButton.disabled = false;
	sendButton.disabled = false;
}

function stopRecording() {
	console.log("stopRecording() called");

	//stop microphone access
	gumStream.getAudioTracks()[0].stop();

	//disable the stop button
	stopButton.disabled = true;
	recordButton.disabled = false;
	sendButton.disabled = false;

	//tell the recorder to finish the recording (stop recording + encode the recorded audio)
	recorder.finishRecording();

	/* __log('Recording stopped'); */
}

// Función modificada para evitar crear una lista y reemplazar el elemento existente
function createDownloadLink(blob, encoding) {
	var url = URL.createObjectURL(blob);
	var existingAudio = recordingsList.querySelector('audio');
	var existingLink = recordingsList.querySelector('a');

	if (!existingAudio || !existingLink) {
		// Si no existen, crea los elementos
		var au = document.createElement('audio');
		var link = document.createElement('a');

		// Configura el <audio> y el enlace
		au.controls = true;
		au.src = url;

		link.href = url;
		link.download = new Date().toISOString() + '.' + encoding;
		link.innerHTML = link.download;

		// Agrega los elementos al contenedor
		recordingsList.innerHTML = ""; // Limpia cualquier contenido previo
		recordingsList.appendChild(au);
		recordingsList.appendChild(link);
	} else {
		// Si ya existen, actualiza sus propiedades
		existingAudio.src = url;
		existingLink.href = url;
		existingLink.download = new Date().toISOString() + '.' + encoding;
		existingLink.innerHTML = existingLink.download;
	}
}

//helper function
/* function __log(e, data) {
	log.innerHTML += "\n" + e + " " + (data || '');
} */



// Función asíncrona que envía el mensaje a Genesys
async function sendMessage() {
	try {
		sendAudio(conversationCache, token, blob); // Envía el mensaje mediante las API de Genesys
		console.log('Audio enviado exitosamente a la API y descargado');
	} catch (error) {
		console.error('Error:', error);
		alert('Error:', error);
	}
}

// Función que utiliza las API para contruir el archivo
function sendAudio(conversationId, token, blob) {
	let apiInstance = new platformClient.ConversationsApi();

	// Get conversation
	apiInstance.getConversation(conversationId)
		.then((conversationList) => {
			console.info(`getConversation success!`);
			// Call the function and get the communicationId
			let communicationId = searchCommunicationId(conversationList);
			console.log('CommunicationId identificado: ' + communicationId);

			// Create media
			apiInstance.postConversationsMessageCommunicationMessagesMedia(conversationId, communicationId)
				.then((media) => {
					console.info(`Conversation message send successfully`);
					// Upload media
					let uploadUrl = media.uploadUrl;
					console.info('URL del media: ' + uploadUrl) // Se puede eliminar
					console.log('Token: ' + token)
					console.log('Record blob: ' + blob);
					uploadAttachment(uploadUrl, token, blob);

					const body = { "mediaIds": [media.id] }
					const opts = { "useNormalizedMessage": false };

					// Send message
					apiInstance.postConversationsMessageCommunicationMessages(conversationId, communicationId, body, opts)
						.then((data) => {
							console.log(`postConversationsMessageCommunicationMessages success!`);
						})
						.catch((err) => {
							console.log("There was a failure calling postConversationsMessageCommunicationMessages");
							console.error(err);
						});

				})
				.catch((error) => {
					console.error(`Conversation message was not send successfully`);
					console.error(error.message);
				});
		})
		.catch((error) => {
			console.error("There was a failure calling getConversation");
			console.error(error.message);
		});

} // FIN sendAudio

// Función que busca el CommunicationId teniendo en cuenta la lista de conversaciones
function searchCommunicationId(conversationList) {
	let variable = "";
	conversationList.participants.forEach(participant => {
		if (participant.purpose === "agent") {
			participant.messages.forEach(message => {
				variable = message.id;
			});
		}
	});
	return variable;
}

function uploadAttachment(uploadUrl, authToken, blob) {
	var form = new FormData();
	form.append('file', blob, 'record.mp3');

	$.ajax({
		url: uploadUrl,
		method: 'POST',
		headers: {
			Authorization: 'bearer ' + authToken
		},
		processData: false,
		contentType: false,
		mimeType: 'multipart/form-data',
		data: form
	});
}