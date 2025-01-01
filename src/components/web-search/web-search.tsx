import { type FunctionDeclaration, Part, SchemaType } from "@google/generative-ai";
import { useEffect, useState, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall, ContentPart, GoogleSearchPart, ServerContent } from "../../multimodal-live-types"; // Import necessary types

// 1. Define the Function Declaration for Web Search
const searchDeclaration: FunctionDeclaration = {
  name: "web_search",
  description: "Searches the internet and returns a list of relevant results.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "The search query string.",
      },
      num_results: {
        type: SchemaType.INTEGER,
        description: "The number of search results to return (optional, default 5).",
      },
    },
    required: ["query"],
  },
};

// Define a type for the search results (adjust this to the actual structure)
type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

// 2. Create the Web Search Component
const WebSearchComponent = () => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]); // Store search results
  const { client, setConfig } = useLiveAPIContext();

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp", // Or your preferred Gemini model
      // ... other config options (generationConfig, systemInstruction, etc.)

      tools: [
        // Enable the built-in Google Search tool
        { googleSearch: {} },
        // Include the web_search function declaration
        { functionDeclarations: [searchDeclaration] },
      ],
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = (toolCall: ToolCall) => {
      // Check for either "web_search" or "googleSearch"
      const webSearchCall = toolCall.functionCalls.find(
        (fc) => fc.name === searchDeclaration.name
      );
      const googleSearchCall = toolCall.functionCalls.find(
        (fc) => fc.name === "googleSearch"
      );

      const fc = webSearchCall || googleSearchCall;

      if (fc) {
        // a. Handle "web_search" call
        if (fc.name === "web_search") {
          const query = (fc.args as any).query;
          const numResults = (fc.args as any).num_results || 5;

          console.log(`Received web_search call: query='${query}', numResults=${numResults}`);
          // Potentially, you might need to trigger a googleSearch call here (if required by the API)
        }

        // b. Handle "googleSearch" call
        if (fc.name === "googleSearch") {
          const searchId = (fc.args as any).id; // Assuming the built-in tool provides a search ID

          console.log(`Received googleSearch call: searchId='${searchId}'`);
          // We'll rely on Gemini sending the results later
        }
      }
    };

    client.on("toolcall", onToolCall);

    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]);

  useEffect(() => {
    const onContent = (content: ServerContent) => {
      if ('modelTurn' in content && content.modelTurn.parts?.length > 0) {
        const resultsPart = content.modelTurn.parts.find(
          (part: Part): part is Part & GoogleSearchPart =>
            'googleSearch' in part &&
            Array.isArray((part as GoogleSearchPart).googleSearch?.results)
        );
  
        if (resultsPart) {
          const results: SearchResult[] = resultsPart.googleSearch.results.map(
            (r: any) => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
            })
          );
          console.log("Received googleSearch results:", results);
          setSearchResults(results);
  
          // Send a success response back to Gemini
          client.sendToolResponse({
            functionResponses: [
              {
                response: {
                  output: { success: true },
                },
                id: "placeholder-function-call-id", // **Replace with the actual ID**
              },
            ],
          });
        }
      }
    };

    client.on("content", onContent);
    
    return () => {
      client.off("content", onContent);
    };
  }, [client]);

  // 3. Display or Use the Search Results
  return (
    <div>
      {searchResults.length > 0 && (
        <div>
          <h3>Search Results:</h3>
          <ul>
            {searchResults.map((result: SearchResult, index: number) => (
              <li key={index}>
                <a href={result.url} target="_blank" rel="noopener noreferrer">
                  {result.title}
                </a>
                <p>{result.snippet}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const WebSearch = memo(WebSearchComponent);