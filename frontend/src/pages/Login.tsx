import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, ArrowRight, Command } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const formSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as any)?.from?.pathname || "/";

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setError(null);

    try {
      await login(values.username, values.password);
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 300);
    } catch (err) {
      setError("Invalid credentials.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white relative selection:bg-zinc-200">
      {/* 
        Fixed Dot Pattern 
        Using direct CSS to guarantee visibility. 
        #94a3b8 is slate-400 (visible gray dots) on white background.
      */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#cbd5e1 1.5px, transparent 1.5px)", // slightly lighter gray for elegance
          backgroundSize: "24px 24px",
          opacity: 0.8,
        }}
      />

      <div className="w-full max-w-[400px] px-6 animate-in fade-in zoom-in-95 duration-500 relative z-10">
        {/* Header - Floating above card */}
        <div className="flex flex-col items-center mb-8 text-center space-y-2">
          <div className="h-12 w-12 bg-black rounded-xl flex items-center justify-center mb-2 shadow-xl shadow-black/10">
            <Command className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Welcome back
          </h1>
          <p className="text-sm text-zinc-500 max-w-[300px]">
            Sign in to DataPurifier
            <br />
            <span className="text-xs text-zinc-400 mt-1 block">
              Intelligent data cleansing & validation platform
            </span>
          </p>
        </div>

        <Card className="border border-zinc-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/80 backdrop-blur-xl transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
          <CardContent className="py-6">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-semibold text-zinc-600 uppercase tracking-wider ml-1">
                        Username
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="admin"
                          {...field}
                          className="bg-zinc-50/50 border-zinc-200 focus-visible:ring-black focus-visible:border-black h-10 transition-all"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="flex items-center justify-between ml-1">
                        <FormLabel className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
                          Password
                        </FormLabel>
                        <span className="text-[10px] font-medium text-zinc-400 hover:text-black cursor-pointer transition-colors">
                          FORGOT?
                        </span>
                      </div>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          {...field}
                          className="bg-zinc-50/50 border-zinc-200 focus-visible:ring-black focus-visible:border-black h-10 font-mono tracking-widest transition-all"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {error && (
                  <div className="text-xs font-medium text-red-500 bg-red-50 border border-red-100 p-2.5 rounded-md flex items-center justify-center animate-in slide-in-from-top-1">
                    {error}
                  </div>
                )}

                <Button
                  className="w-full mt-2 h-10 bg-black hover:bg-zinc-800 text-white font-medium shadow-lg shadow-black/5 hover:shadow-black/10 transition-all active:scale-[0.98]"
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authenticating
                    </>
                  ) : (
                    <>
                      Sign In <ArrowRight className="ml-2 h-4 w-4 opacity-70" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-zinc-400 font-medium">
            Protected by secure encryption
          </p>
        </div>
      </div>
    </div>
  );
}
