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
