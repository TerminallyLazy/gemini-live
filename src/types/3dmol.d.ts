declare namespace $3Dmol {
  interface ViewerConfig {
    backgroundColor?: string;
    antialias?: boolean;
    cartoonQuality?: number;
    disableFog?: boolean;
  }

  interface Viewer {
    setBackgroundColor(color: string): void;
    setStyle(sel: object, style: object): void;
    render(): void;
  }

  function createViewer(
    element: string,
    config: ViewerConfig
  ): Viewer;
}







// declare module '3dmol' {
//   interface Viewer {
//     addModel(data: string, format: string): void;
//     setStyle(sel: object, style: object): void;
//     zoomTo(): void;
//     render(): void;
//     clear(): void;
//     addLabel(text: string, options: {
//       position: { x: number; y: number; z: number };
//       backgroundColor?: string;
//       fontColor?: string;
//       fontSize?: number;
//     }): void;
//     selectedAtoms(selector: object): any[];
//   }

//   interface ViewerConfig {
//     backgroundColor?: string;
//     id?: string;
//     width?: string | number;
//     height?: string | number;
//   }

//   export function createViewer(element: HTMLElement, config?: ViewerConfig): Viewer;
// }
