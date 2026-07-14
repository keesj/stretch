import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import type { CompletedSession } from "../utils/storage";

export function Finished() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = location.state?.session as CompletedSession | undefined;

  const handleReturnHome = () => {
    navigate("/");
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="px-4 py-12 pb-24 max-w-md mx-auto"
    >
      <div className="text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold mb-2">Great Job!</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You completed {session?.routineTitle}
        </p>

        <Card className="p-6 mb-6">
          <div className="text-center">
            <div className="text-4xl font-light mb-2">
              {session
                ? `${Math.floor(session.duration / 60)}:${(session.duration % 60)
                    .toString()
                    .padStart(2, "0")}`
                : "0:00"}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Time</div>
          </div>
        </Card>

        <div className="mb-6">
          <p className="text-lg text-gray-700 dark:text-gray-300 italic">
            "A stretched body is a happy body."
          </p>
        </div>

        <Button onClick={handleReturnHome} className="w-full">
          Back to Home
        </Button>
      </div>
    </motion.div>
  );
}