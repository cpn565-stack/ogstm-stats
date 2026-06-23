export type VoteCounts = Record<string, { green: number; red: number }>;

export interface VoteQuestion {
  id: string;
  label: string;
  options: string[];
}

export interface CheckboxROI {
  green: [number, number, number, number];
  red: [number, number, number, number];
}

export interface ThinkingMapTemplate {
  id: string;
  name: string;
  questions: VoteQuestion[];
  rois?: Record<string, Record<string, CheckboxROI>>;
}

export interface SubmissionVotes {
  [questionId: string]: VoteCounts;
}

export type SubmissionSource = "manual" | "photo";

export interface Submission {
  id: string;
  sessionId: string;
  groupId: string;
  votes: SubmissionVotes;
  source: SubmissionSource;
  confidence?: number;
  photoPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  name: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AggregatedOption {
  option: string;
  green: number;
  red: number;
  total: number;
  greenRate: number;
}

export interface AggregatedQuestion {
  questionId: string;
  label: string;
  options: AggregatedOption[];
}

export interface SessionStats {
  session: Session;
  template: ThinkingMapTemplate;
  submissions: Submission[];
  completedGroups: number;
  totalGroups: number;
  questions: AggregatedQuestion[];
}