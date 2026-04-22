import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@repo/ui/components";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components";
import { Input } from "@repo/ui/components";
import { CreateTopicRequest } from "@repo/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components";
import { PlusCircle, Users } from "lucide-react";
import { Checkbox } from "@repo/ui/components";

// Updated schema to include subscribers
const topicFormSchema = z.object({
  name: z.string().min(3, {
    message: "Topic name must be at least 3 characters.",
  }),
  subscribers: z.array(z.string()).min(1, {
    message: "At least one subscriber queue is required.",
  }),
});

// Updated type definition to match the schema
type TopicFormValues = z.infer<typeof topicFormSchema>;

interface TopicFormProps {
  onSubmit: (values: CreateTopicRequest, subscribers: string[]) => void;
  isLoading?: boolean;
  trigger?: React.ReactNode;
  availableQueues?: { id: string; name: string }[];
}

const TopicForm: React.FC<TopicFormProps> = ({
  onSubmit,
  isLoading = false,
  trigger = (
    <Button>
      <PlusCircle className="mr-2 h-4 w-4" />
      Create Topic
    </Button>
  ),
  availableQueues = [],
}) => {
  const [open, setOpen] = React.useState(false);

  const form = useForm<TopicFormValues>({
    resolver: zodResolver(topicFormSchema),
    defaultValues: {
      name: "",
      subscribers: [],
    },
  });

  const handleSubmit = (values: TopicFormValues) => {
    // Create the topic request
    const topicRequest: CreateTopicRequest = {
      name: values.name,
    };

    // Pass both the topic request and subscribers to the parent component
    onSubmit(topicRequest, values.subscribers);

    if (!isLoading) {
      setOpen(false);
      form.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Topic</DialogTitle>
          <DialogDescription>
            Enter a name for your new publish/subscribe topic and select subscriber queues.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topic Name</FormLabel>
                  <FormControl>
                    <Input placeholder="my-topic" {...field} />
                  </FormControl>
                  <FormDescription>A unique name for your message topic.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subscribers"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">
                      <Users className="h-4 w-4 inline-block mr-2" />
                      Subscribers (required)
                    </FormLabel>
                    <FormDescription>
                      Select at least one queue to subscribe to this topic.
                    </FormDescription>
                  </div>

                  {availableQueues.length === 0 ? (
                    <div className="text-sm text-muted-foreground border border-dashed border-muted-foreground/50 rounded-md p-4 text-center">
                      No queues available. Create a queue first.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {availableQueues.map((queue) => (
                        <FormField
                          key={queue.id}
                          control={form.control}
                          name="subscribers"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={queue.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(queue.id)}
                                    onCheckedChange={(checked) => {
                                      const updatedSubscribers = checked
                                        ? [...field.value, queue.id]
                                        : field.value?.filter((id) => id !== queue.id);
                                      field.onChange(updatedSubscribers);
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">{queue.name}</FormLabel>
                              </FormItem>
                            );
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || availableQueues.length === 0}>
                {isLoading ? "Creating..." : "Create Topic"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default TopicForm;
