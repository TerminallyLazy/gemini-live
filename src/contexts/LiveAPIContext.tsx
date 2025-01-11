/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createContext, FC, ReactNode, useContext } from "react";
import { useLiveAPI, UseLiveAPIResults } from "../hooks/use-live-api";

const LiveAPIContext = createContext<UseLiveAPIResults | undefined>(undefined);

export type LiveAPIProviderProps = {
  children: ReactNode;
  url?: string;
  apiKey: string;
};

export const LiveAPIProvider: FC<LiveAPIProviderProps> = ({
  url,
  apiKey,
  children,
}) => {
  const liveAPI = useLiveAPI({ url, apiKey });

  return (
    <LiveAPIContext.Provider value={liveAPI}>
      {children}
    </LiveAPIContext.Provider>
  );
};

export const useLiveAPIContext = () => {
  const context = useContext(LiveAPIContext);
  if (!context) {
    throw new Error("useLiveAPIContext must be used wihin a LiveAPIProvider");
  }
  return context;
};











// /**
//  * Copyright 2024 Google LLC
//  *
//  * Licensed under the Apache License, Version 2.0 (the "License");
//  * you may not use this file except in compliance with the License.
//  * You may obtain a copy of the License at
//  *
//  *     http://www.apache.org/licenses/LICENSE-2.0
//  *
//  * Unless required by applicable law or agreed to in writing, software
//  * distributed under the License is distributed on an "AS IS" BASIS,
//  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  * See the License for the specific language governing permissions and
//  * limitations under the License.
//  */

// import React, { createContext, FC, ReactNode, useContext } from "react";
// import { useLiveAPI } from "../hooks/use-live-api";
// import { MultimodalLiveClient } from "../lib/multimodal-live-client";
// import { LiveConfig } from "../multimodal-live-types";
// // import { audioContext } from "../lib/utils";

// export type LiveAPIContext = {
//   client: MultimodalLiveClient | null;
//   connected: boolean;
//   connect: () => Promise<void>;
//   disconnect: () => Promise<void>;
//   setConfig: (config: LiveConfig) => void;
//   volume: number;
// };

// export const LiveAPIContext = createContext<LiveAPIContext | null>(null);

// export type LiveAPIProviderProps = {
//   children: ReactNode;
//   url?: string;
//   apiKey: string;
// };

// export const LiveAPIProvider: FC<LiveAPIProviderProps> = ({
//   url,
//   apiKey,
//   children,
// }) => {
//   const { client, connected, connect, disconnect, setConfig, volume } = useLiveAPI({
//     url,
//     apiKey,
//   });
//   return (
//     <LiveAPIContext.Provider value={{ client, connected, connect, disconnect, setConfig, volume }}>
//       {children}
//     </LiveAPIContext.Provider>
//   );
// };

// export const useLiveAPIContext = () => {
//   const context = useContext(LiveAPIContext);
//   if (!context) {
//     throw new Error("useLiveAPIContext must be used wihin a LiveAPIProvider");
//   }
//   return context;
// };
