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
import { Textarea } from "@repo/ui/components";
import { CreateQueueRequest } from "@repo/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components";
import { PlusCircle } from "lucide-react";

const queueFormSchema = z.object({
  name: z.string().min(3, {
    message: "Queue name must be at least 3 characters.",
  }),
  retentionPeriod: z.coerce.number().int().positive().default(14),
  schema: z.string().optional(),
  pushEndpoint: z.url().optional().or(z.literal("")),
});

type QueueFormInput = z.input<typeof queueFormSchema>;
type QueueFormValues = z.output<typeof queueFormSchema>;

interface QueueFormProps {
  onSubmit: (values: CreateQueueRequest) => void;
  isLoading?: boolean;
  trigger?: React.ReactNode;
}

const QueueForm: React.FC<QueueFormProps> = ({
  onSubmit,
  isLoading = false,
  trigger = (
    <Button>
      <PlusCircle className="mr-2 h-4 w-4" />
      Create Queue
    </Button>
  ),
}) => {
  const [open, setOpen] = React.useState(false);

  const form = useForm<QueueFormInput, unknown, QueueFormValues>({
    resolver: zodResolver(queueFormSchema),
    defaultValues: {
      name: "",
      retentionPeriod: 14,
      schema: "",
      pushEndpoint: "",
    },
  });

  const handleSubmit = (values: QueueFormValues) => {
    let schemaObj = undefined;
    if (values.schema) {
      try {
        schemaObj = JSON.parse(values.schema);
      } catch (error) {
        console.error(error);
        form.setError("schema", {
          type: "manual",
          message: "Invalid JSON format",
        });
        return;
      }
    }

    const payload: CreateQueueRequest = {
      name: values.name,
      retentionPeriod: values.retentionPeriod,
      schema: schemaObj,
      pushEndpoint: values.pushEndpoint || undefined,
    };

    onSubmit(payload);
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
          <DialogTitle>Create New Queue</DialogTitle>
          <DialogDescription>Enter details for your new message queue.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Queue Name</FormLabel>
                  <FormControl>
                    <Input placeholder="my-queue" {...field} />
                  </FormControl>
                  <FormDescription>A unique name for your message queue.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="retentionPeriod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Retention Period (days)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      value={field.value as number | string | undefined}
                    />
                  </FormControl>
                  <FormDescription>
                    Number of days to retain messages before automatic deletion.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="schema"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message Schema (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='{"type":"object","properties":{"name":{"type":"string"}}}'
                      className="font-mono resize-y min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    JSON schema to validate incoming messages (optional).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pushEndpoint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Push Endpoint URL (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com/webhook" {...field} />
                  </FormControl>
                  <FormDescription>
                    Endpoint where messages will be pushed automatically (optional).
                  </FormDescription>
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
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Queue"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default QueueForm;
