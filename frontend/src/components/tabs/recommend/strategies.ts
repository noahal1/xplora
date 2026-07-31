import { Heart, Trophy, Sparkles, ListTodo, Gem, Compass } from "lucide-react";

export const STRATEGIES = [
  { id: "taste", icon: Heart },
  { id: "classics", icon: Trophy },
  { id: "mood", icon: Sparkles },
  { id: "playlist", icon: ListTodo },
  { id: "gems", icon: Gem },
  { id: "explore", icon: Compass },
] as const;
