// Malay translations for interface, provider and diagnostic messages.
export const msExtra: Record<string, string> = {
  "The conversation exceeds the model's context limit. Start a new chat or shorten the input, then retry.": "Perbualan melebihi had konteks model. Mulakan sembang baharu atau pendekkan input, kemudian cuba lagi.",
  "OpenAI quota or credits are exhausted. Check your billing and usage limits before retrying.": "Kuota atau kredit OpenAI telah habis. Periksa bil dan had penggunaan sebelum mencuba lagi.",
  "OpenAI rate limit reached. Wait a moment and retry, or check your rate limits.": "Had kadar OpenAI telah dicapai. Tunggu sebentar dan cuba lagi, atau periksa had kadar anda.",
  "OpenAI could not find or grant access to this model. Check the model ID and account permissions.": "OpenAI tidak menemui atau tidak memberikan akses kepada model ini. Periksa ID model dan kebenaran akaun.",
  "OpenAI rejected the API key. Check the key in Providers.": "OpenAI menolak kunci API. Periksa kunci dalam tetapan penyedia.",
  "OpenAI rejected a request setting for this model. Check model compatibility with Responses API and local tools.": "OpenAI menolak tetapan permintaan untuk model ini. Periksa keserasian model dengan Responses API dan alat setempat.",
  "OpenAI rejected a request setting. Check the model ID and its Responses API compatibility.": "OpenAI menolak tetapan permintaan. Periksa ID model dan keserasiannya dengan Responses API.",
  "OpenAI encountered a server error. Wait a moment and retry.": "OpenAI mengalami ralat pelayan. Tunggu sebentar dan cuba lagi.",
  "OpenAI returned an incomplete response. Partial output was retained; retry or shorten the input.": "OpenAI mengembalikan respons yang tidak lengkap. Sebahagian output dikekalkan; cuba lagi atau pendekkan input.",
  "Responses API data is invalid or exceeds the supported size. Check model compatibility and retry.": "Data Responses API tidak sah atau melebihi saiz yang disokong. Periksa keserasian model dan cuba lagi.",
  "OpenAI rejected the Responses API request (HTTP 400). Check the model and its supported settings, then retry.": "OpenAI menolak permintaan Responses API (HTTP 400). Periksa model dan tetapan yang disokong, kemudian cuba lagi.",
  "The request is too large for OpenAI (HTTP 413). Shorten the conversation or attachments, then retry.": "Permintaan terlalu besar untuk OpenAI (HTTP 413). Pendekkan perbualan atau lampiran, kemudian cuba lagi.",

  "Your current draft and attachments will be kept so you can restore them by cancelling the edit. The original message remains unchanged.":
    "Draf dan lampiran semasa akan disimpan supaya boleh dipulihkan apabila suntingan dibatalkan. Mesej asal tidak berubah.",
  "Choose images or text files up to 5 MB each, or drag and drop files here. You can also paste images.":
    "Pilih imej atau fail teks sehingga 5 MB setiap satu, atau seret fail ke sini. Anda juga boleh menampal imej.",
  "Choose images or text files, or drag and drop files here. You can also paste images.":
    "Pilih imej atau fail teks, atau seret fail ke sini. Anda juga boleh menampal imej.",
  "This older update cannot be activated automatically. Close all Luma Chat tabs and windows, then reopen.":
    "Kemas kini lama ini tidak dapat diaktifkan secara automatik. Tutup semua tab dan tetingkap Luma Chat, kemudian buka semula.",
  U: "A",
  "JavaScript tool for next reply": "Alat JavaScript untuk respons seterusnya",
  "Local tools for next reply": "Alat setempat untuk respons seterusnya",
  "Local tools disabled for the next reply.":
    "Alat setempat dinyahaktifkan untuk respons seterusnya.",
  "Local tools enabled for the next reply. Results go to the selected provider.":
    "Alat setempat diaktifkan untuk respons seterusnya. Hasil dihantar kepada penyedia pilihan.",
  "Toggle local tools for the next reply":
    "Tukar alat setempat untuk respons seterusnya",
  "Allow the model to run local JavaScript and receive its results for this reply. Requires a tool-capable model.":
    "Benarkan model menjalankan JavaScript setempat dan menerima hasilnya untuk respons ini. Memerlukan model yang menyokong alat.",
  "JavaScript tool enabled": "Alat JavaScript diaktifkan",
  "JavaScript tool disabled for the next reply.":
    "Alat JavaScript dinyahaktifkan untuk respons seterusnya.",
  "JavaScript enabled for the next reply. Code runs locally; results go to the selected provider.":
    "JavaScript diaktifkan untuk respons seterusnya. Kod berjalan secara setempat; hasil dihantar kepada penyedia pilihan.",
  "Running JavaScript": "Menjalankan JavaScript",
  "Running tool": "Menjalankan alat",
  "Tool input": "Input alat",
  "Invalid or oversized text argument.":
    "Argumen teks tidak sah atau terlalu besar.",
  "File analysis timed out.": "Analisis fail melebihi masa.",
  "File analysis failed.": "Analisis fail gagal.",
  "Invalid tool arguments.": "Argumen alat tidak sah.",
  "Provide valid ISO dates.": "Berikan tarikh ISO yang sah.",
  "Provide a valid ISO date.": "Berikan tarikh ISO yang sah.",
  "Unknown time action.": "Tindakan masa tidak dikenali.",
  "Search text must not be empty.": "Teks carian tidak boleh kosong.",
  "A regular expression is required.": "Ungkapan biasa diperlukan.",
  "Unknown text action.": "Tindakan teks tidak dikenali.",
  "Unknown file action.": "Tindakan fail tidak dikenali.",
  "Select a unique text, CSV, or JSON attachment from this conversation.":
    "Pilih satu lampiran teks, CSV atau JSON yang unik daripada perbualan ini.",
  "Invalid file offset.": "Ofset fail tidak sah.",
  "Invalid memory offset.": "Ofset memori tidak sah.",
  "A memory key is required.": "Kunci memori diperlukan.",
  "Unknown memory action.": "Tindakan memori tidak dikenali.",
  "This tool is not available.": "Alat ini tidak tersedia.",
  "CSV has an unclosed quoted field.":
    "CSV mempunyai medan berpetik yang tidak ditutup.",
  "The tool call limit for this reply was reached.":
    "Had panggilan alat untuk respons ini telah dicapai.",
  "The tool requires a nonempty code string within the source size limit.":
    "Alat memerlukan rentetan kod tidak kosong dalam had saiz sumber.",
  "Provide a nonempty script within the source size limit.":
    "Berikan skrip tidak kosong dalam had saiz sumber.",
  "Could not start the JavaScript worker.":
    "Worker JavaScript tidak dapat dimulakan.",
  "JavaScript runtime did not load in time.":
    "Persekitaran masa jalan JavaScript tidak dimuatkan tepat pada masanya.",
  "The JavaScript runtime stopped unexpectedly.":
    "Persekitaran masa jalan JavaScript terhenti secara tidak dijangka.",
  "Could not read the JavaScript worker result.":
    "Hasil worker JavaScript tidak dapat dibaca.",
  "Could not send code to the JavaScript worker.":
    "Kod tidak dapat dihantar kepada worker JavaScript.",
  "Invalid JavaScript source size.": "Saiz sumber JavaScript tidak sah.",
  "JavaScript runtime initialization or execution failed.":
    "Pemulaan atau pelaksanaan JavaScript gagal.",
  Time: "Masa",
  Calculation: "Pengiraan",
  "File analysis": "Analisis fail",
  "Text processing": "Pemprosesan teks",
  "Local memory": "Memori setempat",
  "Local memories": "Memori setempat",
  "Memory key": "Kunci memori",
  "Memory value": "Nilai memori",
  "Save memory": "Simpan memori",
  "Memories stay on this device and are available to the model when local tools are enabled. They are not included in backups.":
    "Memori kekal pada peranti ini dan tersedia kepada model apabila alat setempat diaktifkan. Memori tidak disertakan dalam sandaran.",
  "Memory entries stay on this device and are not included in backups. Tool records in chat backups may contain memory values sent to the model.":
    "Entri memori kekal pada peranti ini dan tidak disertakan dalam sandaran. Rekod alat dalam sandaran sembang mungkin mengandungi nilai memori yang dihantar kepada model.",
  "Could not read local memories.": "Memori setempat tidak dapat dibaca.",
  "Could not save memory. Check the key and value.":
    "Memori tidak dapat disimpan. Periksa kunci dan nilai.",
  "Could not delete memory.": "Memori tidak dapat dipadam.",
  "Permanently delete all local chats, attachments, memories, settings, and saved keys?":
    "Padam secara kekal semua sembang, lampiran, memori, tetapan dan kunci tersimpan pada peranti ini?",
  "Enable local JavaScript, time, calculation, file, text and memory tools for this reply. Results are sent to the selected model.":
    "Aktifkan alat JavaScript, masa, pengiraan, fail, teks dan memori setempat untuk respons ini. Hasil dihantar kepada model pilihan.",
  Completed: "Selesai",
  Failed: "Gagal",
  "Timed out": "Melebihi masa",
  Cancelled: "Dibatalkan",
  "Limit reached": "Had dicapai",
  "JavaScript source": "Sumber JavaScript",
  "Console output": "Output konsol",
  "Execution result": "Hasil pelaksanaan",
  "No return value.": "Tiada nilai pulangan.",
  "Execution output was truncated.": "Output pelaksanaan telah dipendekkan.",
  "Execution was cancelled.": "Pelaksanaan dibatalkan.",
  "JavaScript execution timed out.": "Pelaksanaan JavaScript melebihi masa.",
  "Inspector sections": "Bahagian pemeriksa",
  "Export snapshot": "Eksport petikan",
  "Export excludes credentials, endpoint addresses, model identifiers, and conversation contents.":
    "Eksport tidak menyertakan kelayakan, alamat titik akhir, pengecam model atau kandungan perbualan.",
  "Effective configuration": "Konfigurasi berkuat kuasa",
  "Active request snapshot": "Petikan permintaan aktif",
  "Historical request snapshot": "Petikan permintaan terdahulu",
  "No request snapshot recorded for this response.":
    "Tiada petikan permintaan direkodkan untuk respons ini.",
  "No telemetry recorded for this response.":
    "Tiada telemetri direkodkan untuk respons ini.",
  "Inspect response": "Periksa respons",
  "Latest response": "Respons terkini",
  Runtime: "Masa jalan",
  Context: "Konteks",
  Configuration: "Konfigurasi",
  Telemetry: "Telemetri",
  Storage: "Storan",
  "Request override": "Tetapan khusus permintaan",
  "Conversation override": "Tetapan khusus perbualan",
  "Global settings": "Tetapan global",
  "Application default": "Lalai aplikasi",
  "Request snapshot": "Petikan permintaan",
  "Captured at": "Dirakam pada",
  "Use global model settings": "Gunakan tetapan model global",
  "Default provider": "Penyedia lalai",
  "Starting an empty chat sends nothing. Your draft and files stay in the original chat.":
    "Memulakan sembang kosong tidak menghantar apa-apa. Draf dan fail anda kekal dalam sembang asal.",
  "The chat or its settings changed. Please send again.":
    "Sembang atau tetapannya telah berubah. Sila hantar semula.",
  "Retry with original model": "Cuba semula dengan model asal",
  "More options": "Lagi pilihan",
  "Slash commands": "Perintah garis miring",
  "Close slash commands": "Tutup perintah garis miring",
  "Run command": "Jalankan perintah",
  "Could not change fullscreen mode.": "Mod skrin penuh tidak dapat ditukar.",
  "Connecting to provider": "Menyambung kepada penyedia",
  "Last provider request succeeded": "Permintaan penyedia terakhir berjaya",
  "Model list reachable; chat not checked":
    "Senarai model boleh dicapai; sembang belum diperiksa",
  "Last provider request failed": "Permintaan penyedia terakhir gagal",
  "Provider connection not checked": "Sambungan penyedia belum diperiksa",
  "Choose model in topbar": "Pilih model di bar atas",
  Edit: "Sunting",
  "Toggle JavaScript tool for the next reply":
    "Tukar alat JavaScript untuk respons seterusnya",
  "Usage request mode": "Mod permintaan penggunaan",
  "Credential state": "Status kelayakan",
  "Available for session": "Tersedia untuk sesi",
  "Saved and locked": "Disimpan dan dikunci",
  "Not set": "Belum ditetapkan",
  Redacted: "Dirahsiakan",
  "Connection target": "Sasaran sambungan",
  "Reasoning support": "Sokongan penaakulan",
  "Provider adapter": "Penyesuai penyedia",
  Startup: "Permulaan",
  Ready: "Sedia",
  "Startup lifecycle": "Kitaran permulaan",
  Browser: "Pelayar",
  "Browser online": "Pelayar dalam talian",
  "Reply phase": "Fasa respons",
  "Reply runtime": "Masa jalan respons",
  "Reply is in current chat": "Respons berada dalam sembang semasa",
  "Processing attachments": "Memproses lampiran",
  "Theme preference": "Pilihan tema",
  "Effective theme": "Tema berkuat kuasa",
  "Language preference": "Pilihan bahasa",
  "Effective language": "Bahasa berkuat kuasa",
  "Active conversation": "Perbualan aktif",
  "Workspace session": "Sesi ruang kerja",
  "Messages eligible for request history":
    "Mesej yang layak untuk sejarah permintaan",
  "Draft length": "Panjang draf",
  "Draft attachments": "Lampiran draf",
  "Conversation model override": "Model khusus perbualan",
  "Credential store": "Storan kelayakan",
  Repository: "Repositori",
  Database: "Pangkalan data",
  "Database version": "Versi pangkalan data",
  "Persisted conversations": "Perbualan tersimpan",
  "Conversations in memory": "Perbualan dalam memori",
  "Buffered draft writes": "Penulisan draf dalam penimbal",
  "Pending repository writes": "Penulisan repositori tertunda",
  "Last write outcome": "Hasil penulisan terakhir",
  "Persistent storage": "Storan berterusan",
  "Origin usage estimate": "Anggaran penggunaan asal",
  "Origin quota estimate": "Anggaran kuota asal",
  "App version": "Versi aplikasi",
  "Display mode": "Mod paparan",
  "Service worker": "Service worker",
  "Page controlled by worker": "Halaman dikawal oleh worker",
  "Checking for updates": "Memeriksa kemas kini",
  "Service Worker API": "API Service Worker",
  "Update lifecycle": "Kitaran kemas kini",
  Yes: "Ya",
  No: "Tidak",
  Cost: "Kos",
  "OpenRouter's reported cost may not include charges from a separate upstream account.":
    "Kos yang dilaporkan OpenRouter mungkin tidak termasuk caj daripada akaun huluan yang berasingan.",
  "TTFT starts at the request and ends at the first generated text or reasoning delta. TTFV ends at the first nonblank answer text. Neither measures provider compute time.":
    "TTFT bermula pada permintaan dan berakhir pada teks atau bahagian penaakulan pertama yang dijana. TTFV berakhir pada teks jawapan pertama yang tidak kosong. Kedua-duanya tidak mengukur masa pengiraan penyedia.",
  "Gemini reports answer and reasoning tokens separately; output tokens show answer tokens only.":
    "Gemini melaporkan token jawapan dan penaakulan secara berasingan; token output hanya menunjukkan token jawapan.",
  "Estimate uses catalog token rates for the selected model, not a billing record.":
    "Anggaran menggunakan kadar token katalog bagi model pilihan, bukan rekod bil.",
  Today: "Hari ini",
  "Previous 7 days": "7 hari sebelumnya",
  Earlier: "Lebih awal",
  "No conversations found.": "Tiada perbualan ditemui.",
  "Search chats...": "Cari sembang...",
  "Search chats": "Cari sembang",
  "Search scope": "Skop carian",
  "No recent conversations.": "Tiada perbualan terkini.",
  "No archived conversations.": "Tiada perbualan diarkibkan.",
  "Actions for {name}": "Tindakan untuk {name}",
  "Project actions for {name}": "Tindakan projek untuk {name}",
  "Project actions": "Tindakan projek",
  Pin: "Semat",
  Unpin: "Nyahsemat",
  "Move to project": "Pindah ke projek",
  "No project": "Tiada projek",
  "New project": "Projek baharu",
  "Rename project": "Namakan semula projek",
  "Project name": "Nama projek",
  "Create project": "Cipta projek",
  "A project with this name already exists.":
    "Projek dengan nama ini sudah wujud.",
  "Archive conversation": "Arkibkan perbualan",
  "Restore from archive": "Pulihkan daripada arkib",
  "Restore {name}": "Pulihkan {name}",
  "Delete conversation": "Padam perbualan",
  "Delete project": "Padam projek",
  "Move all conversations out before deleting this project.":
    "Pindahkan semua perbualan keluar sebelum memadam projek ini.",
  "Resize sidebar": "Ubah saiz bar sisi",
  "Settings sections": "Bahagian tetapan",
  "Rename {name}": "Namakan semula {name}",
  "Remove {name}": "Buang {name}",
  "Delete {name}": "Padam {name}",
  "Starting Luma Chat…": "Memulakan Luma Chat…",
  "Reload app": "Muat semula aplikasi",
  "Could not load the app styles. Check your connection and retry.":
    "Gaya aplikasi tidak dapat dimuatkan. Periksa sambungan dan cuba lagi.",
  "Startup took too long. If another Luma Chat window is open, close it and retry.":
    "Permulaan mengambil masa terlalu lama. Jika tetingkap Luma Chat lain terbuka, tutup dan cuba lagi.",
  "Local storage is blocked by another window. Close other Luma Chat windows and retry.":
    "Storan setempat disekat oleh tetingkap lain. Tutup tetingkap Luma Chat lain dan cuba lagi.",
  "Could not open your local data. Check that browser storage is allowed and retry. Your data was not cleared.":
    "Data setempat tidak dapat dibuka. Pastikan storan pelayar dibenarkan dan cuba lagi. Data anda tidak dipadam.",
  "The app could not display its initial screen. Reload to retry. Your data was not cleared.":
    "Aplikasi tidak dapat memaparkan skrin awal. Muat semula untuk mencuba lagi. Data anda tidak dipadam.",
  "Choose a model": "Pilih model",
  "Search models": "Cari model",
  "Close model selector": "Tutup pemilih model",
  "Load models": "Muatkan model",
  "Loading models…": "Memuatkan model…",
  "No models were listed. Enter the model ID in Providers.":
    "Tiada model disenaraikan. Masukkan ID model dalam Penyedia.",
  "No matching models. Clear the search to load another catalog.":
    "Tiada model sepadan. Kosongkan carian untuk memuatkan katalog lain.",
  "Refine your search to see more models.":
    "Perincikan carian untuk melihat lebih banyak model.",
  "Image input": "Input imej",
  "Ready to send": "Sedia untuk dihantar",
  "Setup needed": "Persediaan diperlukan",
  "Local storage": "Storan setempat",
  "Dismiss message": "Tutup mesej",
  Conversation: "Perbualan",
  "Preparing attachments…": "Menyediakan lampiran…",
  "Image attachment": "Lampiran imej",
  "Text attachment": "Lampiran teks",
  "Saving message…": "Menyimpan mesej…",
  "From this tab’s version": "Daripada versi tab ini",
  "Conversation conflicts": "Konflik perbualan",
  "Another tab changed or deleted this conversation. Save this tab’s version as a separate chat to keep its messages, draft and files.":
    "Tab lain telah mengubah atau memadam perbualan ini. Simpan versi tab ini sebagai sembang berasingan untuk mengekalkan mesej, draf dan fail.",
  "Recovered copy:": "Salinan dipulihkan:",
  "Save a separate copy": "Simpan salinan berasingan",
  "Separate copy saved locally. The original was not changed.":
    "Salinan berasingan disimpan secara setempat. Yang asal tidak berubah.",
  "Save a separate copy before sending from this tab.":
    "Simpan salinan berasingan sebelum menghantar daripada tab ini.",
  "Conversation changed in another tab. This tab did not overwrite it.":
    "Perbualan berubah dalam tab lain. Tab ini tidak menimpanya.",
  "These settings changed in another tab. Review the saved settings before trying again.":
    "Tetapan ini berubah dalam tab lain. Semak tetapan tersimpan sebelum mencuba lagi.",
  "Saving reply locally…": "Menyimpan respons secara setempat…",
  "Reply not saved locally.": "Respons tidak disimpan secara setempat.",
  "Retry local save": "Cuba simpan semula secara setempat",
  "Save the reply locally before sending again.":
    "Simpan respons secara setempat sebelum menghantar semula.",
  "Archiving conversation…": "Mengarkibkan perbualan…",
  "Restoring conversation…": "Memulihkan perbualan…",
  "Conversation archived.": "Perbualan diarkibkan.",
  "Conversation restored.": "Perbualan dipulihkan.",
  "Archive change was not saved. Try again or export before reloading.":
    "Perubahan arkib tidak disimpan. Cuba lagi atau eksport sebelum memuat semula.",
  "Restore was not saved. Try again.": "Pemulihan tidak disimpan. Cuba lagi.",
  finalizing: "memuktamadkan",
  "Stopping…": "Menghentikan…",
  "This model does not support images in the draft or conversation. Choose an image-capable model or remove draft images.":
    "Model ini tidak menyokong imej dalam draf atau perbualan. Pilih model yang menyokong imej atau buang imej draf.",
  "You are offline. You can keep drafting; reconnect to send to this provider.":
    "Anda berada di luar talian. Anda boleh terus menulis draf; sambung semula untuk menghantar kepada penyedia ini.",
  "Set up a model and provider credentials before sending.":
    "Sediakan model dan kelayakan penyedia sebelum menghantar.",
  "Connect your own model. Requests go directly from this browser to the selected provider.":
    "Sambungkan model anda sendiri. Permintaan dihantar terus dari pelayar ini kepada penyedia pilihan.",
  "Connect to a local or trusted network server.":
    "Sambung ke pelayan setempat atau rangkaian yang dipercayai.",
  "Use an OpenRouter key to access its model catalog.":
    "Gunakan kunci OpenRouter untuk mengakses katalog modelnya.",
  "Use your own API key and choose a model.":
    "Gunakan kunci API anda sendiri dan pilih model.",
  "Server base URL": "URL asas pelayan",
  "Current server address": "Alamat pelayan semasa",
  "Edit server address": "Sunting alamat pelayan",
  "Apply address": "Gunakan alamat",
  "Could not save the server address. Try again.":
    "Alamat pelayan tidak dapat disimpan. Cuba lagi.",
  "Backup excludes an invalid LM Studio server address. Set a valid address in AI providers.":
    "Sandaran tidak menyertakan alamat pelayan LM Studio yang tidak sah. Tetapkan alamat yang sah dalam penyedia AI.",
  "Invalid LM Studio address in backup. Import will keep the current server address.":
    "Alamat LM Studio dalam sandaran tidak sah. Import akan mengekalkan alamat pelayan semasa.",
  "Enable CORS in LM Studio. On a phone, use the computer’s network address; localhost refers to the phone. Browser local-network permission, HTTPS restrictions and firewall settings can affect access. Enable authentication when exposing the server.":
    "Aktifkan CORS dalam LM Studio. Pada telefon, gunakan alamat rangkaian komputer; localhost merujuk kepada telefon. Kebenaran rangkaian setempat pelayar, sekatan HTTPS dan tetapan tembok api boleh mempengaruhi akses. Aktifkan pengesahan apabila mendedahkan pelayan.",
  "Model ID": "ID model",
  "Enter a model ID or test connection": "Masukkan ID model atau uji sambungan",
  "This model supports image input": "Model ini menyokong input imej",
  "Enable only when your selected model supports images. Plain text attachments are sent as text.":
    "Aktifkan hanya apabila model pilihan menyokong imej. Lampiran teks biasa dihantar sebagai teks.",
  "Request thought summaries": "Minta ringkasan pemikiran",
  "Request reasoning": "Minta penaakulan",
  "Enable for models that support thought summaries. Some requests or models return no summary.":
    "Aktifkan untuk model yang menyokong ringkasan pemikiran. Sesetengah permintaan atau model tidak memulangkan ringkasan.",
  "Enable for supported models. Reasoning may affect cost, and some models do not expose it.":
    "Aktifkan untuk model yang disokong. Penaakulan boleh mempengaruhi kos, dan sesetengah model tidak memaparkannya.",
  "API token (optional)": "Token API (pilihan)",
  "API key": "Kunci API",
  Token: "Token",
  Key: "Kunci",
  "Keys are accessible to this app while unlocked. Encrypted storage does not protect against malicious scripts or a compromised device. Your provider receives your messages.":
    "Kunci boleh diakses oleh aplikasi ini semasa dibuka kunci. Storan tersulit tidak melindungi daripada skrip berniat jahat atau peranti yang terjejas. Penyedia anda menerima mesej anda.",
  "Enter key for this session": "Masukkan kunci untuk sesi ini",
  Show: "Tunjuk",
  Hide: "Sembunyi",
  "Save encrypted on this device": "Simpan secara tersulit pada peranti ini",
  "Unlock password": "Kata laluan buka kunci",
  "Enter your password": "Masukkan kata laluan anda",
  "If you forget the password, the saved key cannot be recovered. Session keys are cleared on reload.":
    "Jika anda terlupa kata laluan, kunci yang disimpan tidak dapat dipulihkan. Kunci sesi dikosongkan apabila dimuat semula.",
  "Use key": "Gunakan kunci",
  "Unlock saved key": "Buka kunci tersimpan",
  "Delete saved key": "Padam kunci tersimpan",
  Lock: "Kunci",
  "A key or token is available for this session.":
    "Kunci atau token tersedia untuk sesi ini.",
  "A saved key is locked.": "Kunci tersimpan dikunci.",
  "No key is saved.": "Tiada kunci disimpan.",
  "Testing requests the model list and may use network resources. A model list does not confirm the key or chat access.":
    "Ujian meminta senarai model dan mungkin menggunakan sumber rangkaian. Senarai model tidak mengesahkan kunci atau akses sembang.",
  "Cloud providers may reject direct browser requests. This app does not include a proxy or server-side key store.":
    "Penyedia awan mungkin menolak permintaan terus daripada pelayar. Aplikasi ini tidak mengandungi proksi atau storan kunci di pelayan.",
  "Manage your chats, attachments, and browser storage.":
    "Urus sembang, lampiran dan storan pelayar anda.",
  Conversations: "Perbualan",
  Attachments: "Lampiran",
  "Request persistent storage": "Minta storan berterusan",
  Backup: "Sandaran",
  "Export conversations, attachments, and settings. API keys are excluded.":
    "Eksport perbualan, lampiran dan tetapan. Kunci API tidak disertakan.",
  "Export backup": "Eksport sandaran",
  "Import backup": "Import sandaran",
  "The workspace does not fit in one 100 MiB backup.":
    "Ruang kerja tidak muat dalam satu sandaran 100 MiB.",
  "Download each group and import the files one at a time. Each file includes projects and preferences.":
    "Muat turun setiap kumpulan dan import fail satu demi satu. Setiap fail mengandungi projek dan pilihan.",
  "Download group": "Muat turun kumpulan",
  conversations: "perbualan",
  "Not backed up: each conversation below exceeds the limit on its own. Its local data has not been changed.":
    "Tidak disandarkan: setiap perbualan di bawah melebihi had secara sendiri. Data setempatnya tidak diubah.",
  "Cannot create a restorable backup: invalid workspace records. No data was changed.":
    "Sandaran yang boleh dipulihkan tidak dapat dibuat: rekod ruang kerja tidak sah. Tiada data diubah.",
  "Backup metadata alone exceeds the file limit. No data was changed.":
    "Metadata sandaran sahaja melebihi had fail. Tiada data diubah.",
  "Importing backup…": "Mengimport sandaran…",
  "Save the local reply before replacing its conversation, or skip conflicts.":
    "Simpan respons setempat sebelum menggantikan perbualannya, atau langkau konflik.",
  "Also import appearance and provider settings":
    "Import juga tetapan penampilan dan penyedia",
  "A local edit is still saving. Try the import again after it is saved.":
    "Suntingan setempat masih disimpan. Cuba import semula selepas ia disimpan.",
  "Local data changed since preview. Nothing was imported. Save your work, reload and preview again.":
    "Data setempat berubah sejak pratonton. Tiada apa-apa diimport. Simpan kerja anda, muat semula dan pratonton lagi.",
  "Import failed. Nothing was imported; your existing data and saved keys are unchanged.":
    "Import gagal. Tiada apa-apa diimport; data sedia ada dan kunci tersimpan anda tidak berubah.",
  "Browser storage can be cleared or evicted. Keep a backup of conversations you need. Data does not automatically sync between devices.":
    "Storan pelayar boleh dikosongkan atau dibuang. Simpan sandaran perbualan yang diperlukan. Data tidak disegerakkan secara automatik antara peranti.",
  "Import preview": "Pratonton import",
  "conversations;": "perbualan;",
  "have an existing ID. Backups do not contain keys.":
    "mempunyai ID sedia ada. Sandaran tidak mengandungi kunci.",
  "Import and skip conflicts": "Import dan langkau konflik",
  "Replace conflicts": "Gantikan yang bercanggah",
  "Clear all local data": "Kosongkan semua data setempat",
  "No conversations yet.": "Belum ada perbualan.",
  "messages ·": "mesej ·",
  "Choose how Luma Chat looks on this device.":
    "Pilih penampilan Luma Chat pada peranti ini.",
  "Language and theme": "Bahasa dan tema",
  "Check for updates": "Semak kemas kini",
  "You are offline. Reconnect to check for updates.":
    "Anda berada di luar talian. Sambung semula untuk menyemak kemas kini.",
  "The app is still preparing offline support. Try again shortly.":
    "Aplikasi masih menyediakan sokongan luar talian. Cuba lagi sebentar lagi.",
  "Update checks are unavailable in this build or browser.":
    "Semakan kemas kini tidak tersedia dalam binaan atau pelayar ini.",
  "An update is ready. Finish any reply, close all Luma Chat tabs and app windows, then reopen. You may need to unlock your key again.":
    "Kemas kini telah sedia. Selesaikan sebarang respons, tutup semua tab dan tetingkap Luma Chat, kemudian buka semula. Anda mungkin perlu membuka kunci anda semula.",
  "Delete this conversation and its saved attachments?":
    "Padam perbualan ini dan lampiran yang disimpan?",
  "Start a new chat first.": "Mulakan sembang baharu dahulu.",
  "Importing preferences will change the LM Studio server:":
    "Mengimport pilihan akan menukar pelayan LM Studio:",
  "Invalid server address": "Alamat pelayan tidak sah",
  "Authorize this previously saved token for this server?":
    "Benarkan token yang disimpan sebelum ini untuk pelayan ini?",
  "This token belongs to another server. Restore its address or enter a new token.":
    "Token ini milik pelayan lain. Pulihkan alamatnya atau masukkan token baharu.",
  "Enter a valid server address before using a credential.":
    "Masukkan alamat pelayan yang sah sebelum menggunakan kelayakan.",
  "Choose a model and enter your key in Providers. LM Studio does not require a key unless authentication is enabled.":
    "Pilih model dan masukkan kunci anda dalam Penyedia. LM Studio tidak memerlukan kunci melainkan pengesahan diaktifkan.",
  "Enable image support for this model in Providers before sending images.":
    "Aktifkan sokongan imej untuk model ini dalam Penyedia sebelum menghantar imej.",
  "Message was not sent because local storage failed. Your draft and attachments are still visible.":
    "Mesej tidak dihantar kerana storan setempat gagal. Draf dan lampiran anda masih kelihatan.",
  "Choose a model and unlock its key in Providers.":
    "Pilih model dan buka kuncinya dalam Penyedia.",
  "Retry sends a new request to the selected provider and may incur charges. Continue?":
    "Cuba semula menghantar permintaan baharu kepada penyedia pilihan dan mungkin dikenakan caj. Teruskan?",
  "Retry was not sent because local storage failed. The conversation remains visible.":
    "Percubaan semula tidak dihantar kerana storan setempat gagal. Perbualan masih kelihatan.",
  "Connecting…": "Menyambung…",
  "Model list loaded but no models were listed. This does not verify your key or chat access; enter a model ID manually.":
    "Senarai model dimuatkan tetapi tiada model disenaraikan. Ini tidak mengesahkan kunci atau akses sembang anda; masukkan ID model secara manual.",
  "Enter a key or token first.": "Masukkan kunci atau token dahulu.",
  "Enter an unlock password.": "Masukkan kata laluan buka kunci.",
  "Key encrypted and unlocked on this device.":
    "Kunci disulitkan dan dibuka pada peranti ini.",
  "Key available for this session only.":
    "Kunci tersedia untuk sesi ini sahaja.",
  "Key unlocked for this session.": "Kunci dibuka untuk sesi ini.",
  "Key locked for this session.": "Kunci dikunci untuk sesi ini.",
  "Saved key removed and session locked.":
    "Kunci tersimpan dibuang dan sesi dikunci.",
  "Could not unlock key. Check your password.":
    "Kunci tidak dapat dibuka. Periksa kata laluan anda.",
  "Unsupported encrypted key format.": "Format kunci tersulit tidak disokong.",
  "Backup exceeds the 100 MiB file limit.":
    "Sandaran melebihi had fail 100 MiB.",
  "Invalid or unsupported backup file.":
    "Fail sandaran tidak sah atau tidak disokong.",
  "Import appearance and provider settings? Saved keys will remain on this device.":
    "Import tetapan penampilan dan penyedia? Kunci tersimpan akan kekal pada peranti ini.",
  "Replace existing conversations with matching IDs?":
    "Gantikan perbualan sedia ada yang mempunyai ID sepadan?",
  "Permanently delete all local chats, attachments, settings, and saved keys?":
    "Padam secara kekal semua sembang, lampiran, tetapan dan kunci tersimpan setempat?",
  "Other open tabs keep their in-memory drafts and keys. Close them to end those sessions.":
    "Tab lain yang terbuka mengekalkan draf dan kunci dalam memorinya. Tutup tab tersebut untuk menamatkan sesi berkenaan.",
  "Clearing local data…": "Mengosongkan data setempat…",
  "Could not clear local data. Nothing was deleted. Try again.":
    "Data setempat tidak dapat dikosongkan. Tiada apa-apa dipadam. Cuba lagi.",
  "Local data cleared.": "Data setempat telah dikosongkan.",
  "Copy unavailable.": "Penyalinan tidak tersedia.",
  "Plain text": "Teks biasa",
  "Load image: {name}": "Muatkan imej: {name}",
  "Open image link": "Buka pautan imej",
  "Loading an image may contact an external server.":
    "Memuatkan imej mungkin menghubungi pelayan luaran.",
  "Persistent storage is unavailable in this browser.":
    "Storan berterusan tidak tersedia dalam pelayar ini.",
  "Persistent storage granted.": "Storan berterusan diluluskan.",
  "Persistent storage was not granted; keep backups.":
    "Storan berterusan tidak diluluskan; simpan sandaran.",
  "Could not request persistent storage.":
    "Storan berterusan tidak dapat diminta.",
  "Authentication failed (HTTP 401). Check this provider's key or token.":
    "Pengesahan gagal (HTTP 401). Periksa kunci atau token penyedia ini.",
  "Access denied (HTTP 403). Check the provider's account permissions and model access.":
    "Akses ditolak (HTTP 403). Periksa kebenaran akaun penyedia dan akses model.",
  "Payment or credit limit reached (HTTP 402). Check the provider account and key limits.":
    "Had pembayaran atau kredit dicapai (HTTP 402). Periksa akaun penyedia dan had kunci.",
  "Model or endpoint not found (HTTP 404). Check the provider, model ID, and server address.":
    "Model atau titik akhir tidak ditemui (HTTP 404). Periksa penyedia, ID model dan alamat pelayan.",
  "Rate limit or quota exceeded (HTTP 429). Wait or check the provider account.":
    "Had kadar atau kuota dilebihi (HTTP 429). Tunggu atau periksa akaun penyedia.",
  "Provider returned an invalid model list.":
    "Penyedia mengembalikan senarai model yang tidak sah.",
  "Choose or enter a model in Providers.":
    "Pilih atau masukkan model dalam Penyedia.",
  "Enter an API key in Providers.": "Masukkan kunci API dalam Penyedia.",
  "The provider returned an empty response.":
    "Penyedia mengembalikan respons kosong.",
  "The provider returned invalid streaming data. Partial output was retained.":
    "Penyedia mengembalikan data penstriman tidak sah. Sebahagian output dikekalkan.",
  "The provider reported an error while generating.":
    "Penyedia melaporkan ralat semasa menjana.",
  "The provider reported an error while generating. Partial output was retained.":
    "Penyedia melaporkan ralat semasa menjana. Sebahagian output dikekalkan.",
  "The model reached its output limit. Partial output was retained.":
    "Model mencapai had outputnya. Sebahagian output dikekalkan.",
  "The provider stopped the response due to its content policy. Partial output was retained.":
    "Penyedia menghentikan respons kerana dasar kandungannya. Sebahagian output dikekalkan.",
  "The provider returned no text. Check model compatibility or safety filters.":
    "Penyedia tidak mengembalikan teks. Periksa keserasian model atau penapis keselamatan.",
  "The response was interrupted before completion. Partial output was retained.":
    "Respons terganggu sebelum selesai. Sebahagian output dikekalkan.",
  "Enter a valid HTTP(S) endpoint without credentials, query, or fragment.":
    "Masukkan titik akhir HTTP(S) yang sah tanpa kelayakan, pertanyaan atau fragmen.",
  "Cloud providers require HTTPS.": "Penyedia awan memerlukan HTTPS.",
  "Something went wrong.": "Sesuatu telah berlaku.",
};
