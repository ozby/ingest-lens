import React from "react";
import { IMessage } from "@repo/types";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components";
import { formatDistanceToNow } from "date-fns";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@repo/ui/components";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@repo/ui/components";

interface MessageListProps {
  messages: IMessage[];
  onDelete?: (queueId: string, messageId: string) => void;
  isLoading?: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ messages, onDelete, isLoading = false }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-pulse-soft">Loading messages...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (messages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-4xl mb-4">📭</div>
            <h3 className="text-lg font-medium mb-2">No Messages</h3>
            <p className="text-sm text-muted-foreground">
              There are no messages in this queue at the moment.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messages</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-[600px] overflow-y-auto subtle-scroll pr-2">
          {messages.map((message) => (
            <div
              key={message.id}
              className="border rounded-lg p-4 transition-all-200 hover:shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {!message.received ? (
                    <Eye className="h-4 w-4 text-green-500" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm font-medium">
                    Message ID: {message.id.substring(0, 8)}...
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                  </span>
                  {onDelete && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => onDelete(message.queueId, message.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete message</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>

              <div className="border-t pt-2 mt-2">
                <div className="mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Message Data:</span>
                </div>
                <pre className="bg-slate-50 dark:bg-slate-900 p-2 rounded text-xs overflow-x-auto">
                  {JSON.stringify(message.data, null, 2)}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Received count:</span>{" "}
                  <span className="font-medium">{message.receivedCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Expires:</span>{" "}
                  <span className="font-medium">
                    {formatDistanceToNow(new Date(message.expiresAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default MessageList;
