"use client"

import type { ReactNode } from "react"
import { CodeBlock } from "@/components/code-block"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type DemoCardProps = {
  title: string
  description: string
  code: string
  children: ReactNode
}

export function DemoCard({ title, description, code, children }: DemoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="demo">
          <TabsList>
            <TabsTrigger value="demo">Demo</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
          </TabsList>
          <TabsContent value="demo">
            <div className="space-y-4 pt-2">{children}</div>
          </TabsContent>
          <TabsContent value="code">
            <CodeBlock code={code} language="typescript" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
