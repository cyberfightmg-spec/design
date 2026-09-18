export interface StyleGenerationProfile {
  palette: string[];
  materials: string[];
  furniture: string[];
  lighting: string[];
  decor: string[];
  mood: string[];
}

export type StyleCategory = 'classic' | 'modern' | 'ethnic' | 'retro' | 'natural';

export interface InteriorStyle {
  id: string;
  displayName: string;
  voiceText: string;
  category: StyleCategory;
  generationProfile: StyleGenerationProfile;
  architectureWarnings: string[];
  sortOrder: number;
}

export const STYLE_CATEGORIES: Record<StyleCategory, string> = {
  classic: 'Классические',
  modern: 'Современные',
  ethnic: 'Этнические / географические',
  retro: 'Retro',
  natural: 'Природные / эклектичные',
};
