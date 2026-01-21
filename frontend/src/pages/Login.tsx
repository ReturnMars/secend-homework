import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, ArrowRight, Command } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
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
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    setSuccess(null);

    try {
      if (isRegistering) {
        // Register Logic
        // Register Logic
        await api.post("/register", values);

        // Removed unnecessary manual error check as api throws on error
        setSuccess("Account created successfully! Signing in...");

        // Auto login after small delay
        setTimeout(async () => {
          try {
            await login(values.username, values.password);
            navigate(from, { replace: true });
          } catch (loginErr) {
            setError(
              "Registration successful, but auto-login failed. Please sign in.",
            );
            setIsRegistering(false);
            setSuccess(null);
            setIsLoading(false);
          }
        }, 800);
      } else {
        // Login Logic
        await login(values.username, values.password);
        setTimeout(() => {
          navigate(from, { replace: true });
        }, 300);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message || "Operation failed. Please check your inputs.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white relative selection:bg-zinc-200">
      {/* 
        Fixed Dot Pattern 
        Using direct CSS to guarantee visibility. 
        #cbd5e1 is slate-300 (visible gray dots) on white background.
      */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#cbd5e1 1.5px, transparent 1.5px)",
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
            欢迎回来
          </h1>
          <p className="text-sm text-zinc-500 max-w-[300px]">
            登录 DataPurifier
            <br />
            <span className="text-xs text-zinc-400 mt-1 block">
              智能数据清洗与验证平台
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
                        用户名
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
                          密码
                        </FormLabel>
                        {!isRegistering && (
                          <span className="text-[10px] font-medium text-zinc-400 hover:text-black cursor-pointer transition-colors">
                            忘记密码？
                          </span>
                        )}
                      </div>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="请输入密码"
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
                {success && (
                  <div className="text-xs font-medium text-green-600 bg-green-50 border border-green-100 p-2.5 rounded-md flex items-center justify-center animate-in slide-in-from-top-1">
                    {success}
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
                      {isRegistering ? "正在创建账户..." : "身份验证中..."}
                    </>
                  ) : (
                    <>
                      {isRegistering ? "立即注册" : "登录"}{" "}
                      <ArrowRight className="ml-2 h-4 w-4 opacity-70" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Toggle between Login and Register */}
        <div className="mt-8 text-center">
          <p className="text-xs text-zinc-500">
            {isRegistering ? "已有账户？" : "还没有账户？"}
            <span
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError(null);
                setSuccess(null);
                form.reset();
              }}
              className="text-zinc-900 font-semibold cursor-pointer hover:underline underline-offset-4"
            >
              {isRegistering ? "立即登录" : "开始使用"}
            </span>
          </p>

          <p className="text-[10px] text-zinc-400 font-medium mt-4">
            © 2026 数据治理团队
          </p>
        </div>
      </div>
    </div>
  );
}
