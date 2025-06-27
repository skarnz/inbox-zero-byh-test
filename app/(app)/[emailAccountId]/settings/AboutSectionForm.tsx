"use client";

import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { saveAboutAction, type SaveAboutBody } from "@/utils/actions/user";
import {
  FormSection,
  FormSectionLeft,
  FormSectionRight,
  SubmitButtonWrapper,
} from "@/components/Form";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError, toastSuccess } from "@/components/Toast";

export const AboutSectionForm = ({
  about,
  mutate,
}: {
  about: string | null;
  mutate: () => void;
}) => {
  const {
    register,
    formState: { errors },
    handleSubmit,
  } = useForm<SaveAboutBody>({
    defaultValues: { about: about ?? "" },
  });

  const { emailAccountId } = useAccount();

  const { execute, isExecuting } = useAction(
    saveAboutAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Your profile has been updated!",
        });
      },
      onError: (error) => {
        toastError({
          description:
            error.error.serverError ??
            "An unknown error occurred while updating your profile",
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  return (
    <form onSubmit={handleSubmit(execute)}>
      <FormSection>
        <FormSectionLeft
          title="About you"
          description="Provide extra information that will help our AI better understand how to process your emails."
        />
        <div className="md:col-span-2">
          <FormSectionRight>
            <div className="sm:col-span-full">
              <Input
                type="text"
                autosizeTextarea
                rows={4}
                name="about"
                label="About you"
                registerProps={register("about")}
                error={errors.about}
                placeholder={`My name is John Doe. I'm the founder of a startup called Doe.
Some rules to follow:
* Be friendly, concise, and professional, but not overly formal.
* Keep responses short and to the point.`}
              />
            </div>
          </FormSectionRight>
          <SubmitButtonWrapper>
            <Button type="submit" loading={isExecuting}>
              Save
            </Button>
          </SubmitButtonWrapper>
        </div>
      </FormSection>
    </form>
  );
};
