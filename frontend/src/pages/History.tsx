import { useNavigate } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function History() {
  const navigate = useNavigate();

  return (
    <div className="container max-w-screen-2xl mx-auto py-10 px-4 sm:px-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
      <div className="h-20 w-20 bg-muted/50 rounded-full flex items-center justify-center">
        <Construction className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">History Page</h1>
        <p className="text-muted-foreground">
          This feature is currently under development. You will be able to view
          and filter all past cleaning batches here.
        </p>
      </div>
      <Button variant="outline" onClick={() => navigate("/")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>
    </div>
  );
}
