import React from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@repo/ui/components";
import { cn } from "@repo/ui/lib";
import { LucideIcon } from "lucide-react";

interface MetricsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  iconColor?: string;
}

const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className,
  iconColor = "text-primary",
}) => {
  return (
    <Card className={cn("transition-all-300 hover:shadow-md overflow-hidden", className)}>
      <CardHeader className="p-4 pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div
          className={cn(
            "p-2 rounded-full bg-primary/10",
            iconColor.replace("text-", "bg-") + "/10",
          )}
        >
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
      {trend && (
        <CardFooter className="p-4 pt-0 flex items-center">
          <div
            className={cn(
              "text-xs font-medium flex items-center",
              trend.isPositive ? "text-green-500" : "text-red-500",
            )}
          >
            {trend.isPositive ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3 h-3 mr-1"
              >
                <path
                  fillRule="evenodd"
                  d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3 h-3 mr-1"
              >
                <path
                  fillRule="evenodd"
                  d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {Math.abs(trend.value)}% from last period
          </div>
        </CardFooter>
      )}
    </Card>
  );
};

export default MetricsCard;
