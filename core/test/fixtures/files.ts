export const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fake test file")

export const resourcePage = (origin: string) => `<!doctype html><html><head><title>Lecture 1 - Arrays</title></head><body>
<img src="${origin}/rait/pluginfile.php/1/theme_dypatil/logo/logo.png">
<a href="${origin}/rait/course/view.php?id=812">Back to course</a>
<div class="resourceworkaround">Click <a href="${origin}/rait/pluginfile.php/77/mod_resource/content/1/Lecture%201%20-%20Arrays.pdf?forcedownload=1">Lecture 1 - Arrays.pdf</a> to open the file.</div>
</body></html>`

export const flexpaperPage = (origin: string) => `<!doctype html><html><head><title>Linked Lists notes</title></head><body>
<a href="${origin}/rait/course/view.php?id=812">Back to course</a>
<div id="documentViewer"></div>
<script>
$('#documentViewer').FlexPaperViewer({ config : {
  PDFFile : '${origin}/rait/pluginfile.php/78/mod_flexpaper/content/0/Linked%20Lists.pdf',
  Scale : 0.6
}});
</script>
</body></html>`

export const presentationPage = (origin: string) => `<!doctype html><html><head><title>Trees slides</title></head><body>
<iframe id="presentationobject" src="${origin}/rait/pluginfile.php/80/mod_presentation/content/0/Trees.pptx"></iframe>
</body></html>`
