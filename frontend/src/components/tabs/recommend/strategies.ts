import { Heart, Trophy, Sparkles, Calendar, Gem, Compass } from "lucide-react";

export const STRATEGIES = [
  { id: "taste", icon: Heart },
  { id: "classics", icon: Trophy },
  { id: "mood", icon: Sparkles },
  { id: "era", icon: Calendar },
  { id: "gems", icon: Gem },
  { id: "explore", icon: Compass },
] as const;
