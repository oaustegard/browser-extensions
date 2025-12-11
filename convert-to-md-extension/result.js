(function(){
    // Helper: Get a query parameter by name.
    function getQueryParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
  
    const originalUrlEncoded = getQueryParameter("target");
    if (!originalUrlEncoded) {
        document.getElementById("content").textContent = "No target URL provided.";
        return;
    }
    
    // Decode the original URL.
    const originalUrl = decodeURIComponent(originalUrlEncoded);
    
    // Default options.
    const DEFAULT_OPTIONS = { mode: "v1", copy: true };
    
    chrome.storage.sync.get(DEFAULT_OPTIONS, (options) => {
        // Construct the API endpoint.
        const apiUrl = "https://r.jina.ai/" + originalUrl;
        
        // Prepare fetch options (headers if v2 mode).
        let fetchOptions = {};
        if(options.mode === "v2"){
            fetchOptions.headers = {
                "x-engine": "readerlm-v2",
                "Accept": "text/event-stream"
            };
        }
        
        if(options.mode === "v2"){
            // Use fetch and process the event stream.
            fetch(apiUrl, fetchOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error("Network error: " + response.statusText);
                }
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";
                let finalMarkdown = "";
                
                // Process the stream recursively.
                function processStream() {
                    return reader.read().then(({done, value}) => {
                        if (done) {
                            // Stream finished; copy final markdown if needed.
                            if (options.copy) {
                                navigator.clipboard.writeText(finalMarkdown)
                                .then(() => {
                                    document.getElementById("status").textContent = "Copied to clipboard.";
                                })
                                .catch(err => {
                                    document.getElementById("status").textContent = "Failed to copy to clipboard: " + err;
                                });
                            } else {
                                document.getElementById("status").textContent = "Result loaded.";
                            }
                            return;
                        }
                        
                        // Decode this chunk and add to the buffer.
                        const chunk = decoder.decode(value, {stream: true});
                        buffer += chunk;
                        
                        // SSE events are separated by two newlines.
                        let parts = buffer.split("\n\n");
                        // The last part might be incomplete; keep it in the buffer.
                        buffer = parts.pop();
                        
                        // Process each complete event.
                        for (const part of parts) {
                            // Each event block may include lines like:
                            //   event: data
                            //   data: { ... }
                            const lines = part.split("\n");
                            for (const line of lines) {
                                if (line.startsWith("data:")) {
                                    // Remove the "data:" prefix and trim.
                                    const dataText = line.substring(5).trim();
                                    if (dataText) {
                                        try {
                                            const obj = JSON.parse(dataText);
                                            // Update the finalMarkdown and the display.
                                            finalMarkdown = obj.content;
                                            document.getElementById("content").textContent = finalMarkdown;
                                        } catch(e) {
                                            console.error("Error parsing JSON:", e);
                                        }
                                    }
                                }
                            }
                        }
                        // Continue processing the stream.
                        return processStream();
                    });
                }
                return processStream();
            })
            .catch(err => {
                document.getElementById("content").textContent = "Error fetching result: " + err;
            });
        } else {
            // v1 mode: simply fetch the complete result.
            fetch(apiUrl, fetchOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error("Network error: " + response.statusText);
                }
                return response.text();
            })
            .then(markdown => {
                document.getElementById("content").textContent = markdown;
                if(options.copy){
                    navigator.clipboard.writeText(markdown)
                    .then(() => {
                        document.getElementById("status").textContent = "Copied to clipboard.";
                    })
                    .catch(err => {
                        document.getElementById("status").textContent = "Failed to copy to clipboard: " + err;
                    });
                } else {
                    document.getElementById("status").textContent = "Result loaded.";
                }
            })
            .catch(err => {
                document.getElementById("content").textContent = "Error fetching result: " + err;
            });
        }
    });
  })();
  