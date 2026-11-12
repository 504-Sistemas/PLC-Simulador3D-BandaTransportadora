export interface AnimatedPiece {
  id: number;
  category: 'A' | 'B';
  willJam: boolean;
  xPercent: number;
  yOffset: number;
  triggeredI3: boolean;
  triggeredClassify: boolean;
  sorted: boolean;
}

export type ViewportMode = '3d' | '2d' | 'dual';
