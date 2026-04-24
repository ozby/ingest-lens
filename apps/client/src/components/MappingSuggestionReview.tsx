import { MappingSuggestion, SuggestionReviewStatus } from "@repo/types";
import { Checkbox } from "@repo/ui/components";
import { Badge } from "@repo/ui/components";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components";

interface MappingSuggestionReviewProps {
  suggestion: MappingSuggestion;
  checked?: boolean;
  disabled?: boolean;
  onToggle?: (id: string, next: boolean) => void;
}

const statusTone: Record<SuggestionReviewStatus, string> = {
  pending: "text-blue-600",
  approved: "text-emerald-600",
  rejected: "text-rose-600",
};

const MappingSuggestionReview = ({
  suggestion,
  checked,
  disabled,
  onToggle,
}: MappingSuggestionReviewProps) => {
  const confidencePercent = Math.round(suggestion.confidence * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">{suggestion.id}</CardTitle>
            <CardDescription>
              {suggestion.sourcePath}
              {" -> "}
              {suggestion.targetField}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            {onToggle ? (
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onToggle(suggestion.id, value === true)
                }
                disabled={disabled}
              />
            ) : null}
            <Badge className={statusTone[suggestion.reviewStatus]} variant="outline">
              {suggestion.reviewStatus}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 text-sm">
        <div className="space-y-1">
          <p className="text-muted-foreground">Transform</p>
          <p>{suggestion.transformKind}</p>
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground">Confidence</p>
          <div
            aria-label={`Confidence ${confidencePercent}%`}
            className="h-2 rounded-full bg-slate-200 dark:bg-slate-800"
          >
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <p>{confidencePercent}%</p>
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground">Evidence sample</p>
          <p className="font-mono text-xs break-all">{suggestion.evidenceSample}</p>
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground">Explanation</p>
          <p>{suggestion.explanation}</p>
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground">Deterministic validation</p>
          <p>
            {suggestion.deterministicValidation.isValid ? "passed" : "failed"} · replay{" "}
            {suggestion.replayStatus}
          </p>
          {suggestion.deterministicValidation.errors.length > 0 ? (
            <p className="text-xs text-rose-600 dark:text-rose-300">
              {suggestion.deterministicValidation.errors.join(", ")}
            </p>
          ) : null}
        </div>

        {suggestion.judgeAssessment ? (
          <div className="space-y-1">
            <p className="text-muted-foreground">Judge verdict</p>
            <p>
              {suggestion.judgeAssessment.verdict} · confidence {suggestion.judgeAssessment.confidence}
            </p>
            {suggestion.judgeAssessment.concerns.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                {suggestion.judgeAssessment.concerns.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default MappingSuggestionReview;
